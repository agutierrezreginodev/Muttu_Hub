-- pgTAP: service_role grants (20260728050000_service_role_grants.sql).
--
-- service_role has rolbypassrls = true — it skips RLS *policies* entirely —
-- but BYPASSRLS does not skip ordinary table-privilege checks. Before this
-- migration, service_role had zero SELECT/INSERT/UPDATE grants on any of
-- the 5 tables (only the incidental TRUNCATE/REFERENCES/TRIGGER privileges
-- Postgres leaves after Supabase's default-privilege ALL was revoked from
-- anon/authenticated by 0003_audit and never re-granted to service_role).
-- That silently broke scripts/bootstrap-admin.ts and the design's own
-- requirement that usuario INSERT be "service role only" (Engram
-- sdd/platform-foundation/design, obs #137). This file proves the grants
-- are present and that service_role still respects the same guardrails as
-- authenticated: no DELETE anywhere, registro_acceso stays append-only.

begin;

select plan(10);

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'svc-test@test.local');

set local role service_role;

-- 1-3: rol.
select lives_ok(
  $$select count(*) from public.rol$$,
  'service_role can SELECT rol');

select lives_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Service Role Test', '{
    "crm":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "kanban":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "documentos":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "dashboard":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "admin":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false}}')$$,
  'service_role can INSERT rol');

select throws_ok(
  $$delete from public.rol where nombre = 'Rol Service Role Test'$$,
  '42501', null,
  'service_role cannot DELETE rol (no DELETE grant anywhere, soft delete via RPC only)');

-- 4-6: usuario — the grant explicitly required by design
-- ("INSERT: none (service role only)").
select lives_ok(
  $$insert into public.usuario (id, nombre, email, rol_id)
    values ('44444444-4444-4444-4444-444444444444', 'Service Role Test', 'svc-test@test.local',
            (select id from public.rol where nombre = 'Colaborador'))$$,
  'service_role can INSERT usuario (design: INSERT is service-role only)');

select lives_ok(
  $$update public.usuario set nombre = 'Service Role Test Editado'
    where id = '44444444-4444-4444-4444-444444444444'$$,
  'service_role can UPDATE usuario');

select throws_ok(
  $$delete from public.usuario where id = '44444444-4444-4444-4444-444444444444'$$,
  '42501', null,
  'service_role cannot DELETE usuario either (soft delete via RPC only)');

-- 7-9: registro_acceso stays append-only even for service_role (needed for
-- admin-triggered events: invitacion, desactivacion, reactivacion).
select lives_ok(
  $$insert into public.registro_acceso (usuario_id, evento)
    values ('44444444-4444-4444-4444-444444444444', 'invitacion')$$,
  'service_role can INSERT registro_acceso (admin-triggered events)');

select throws_ok(
  $$update public.registro_acceso set evento = 'login'
    where usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  '42501', null,
  'service_role cannot UPDATE registro_acceso (append-only)');

select throws_ok(
  $$delete from public.registro_acceso where usuario_id = '44444444-4444-4444-4444-444444444444'$$,
  '42501', null,
  'service_role cannot DELETE registro_acceso (append-only)');

-- 10: cliente sanity (same grant shape as rol/usuario, not exhaustively
-- re-tested here). tarea is intentionally not covered: it belongs to the
-- CRM/Kanban modules, out of scope for this change, and its
-- created_by NOT NULL constraint is unrelated to the grants fix.
select lives_ok(
  $$insert into public.cliente (nombre) values ('Cliente Service Role Test')$$,
  'service_role can INSERT cliente');

reset role;

select * from finish();

rollback;
