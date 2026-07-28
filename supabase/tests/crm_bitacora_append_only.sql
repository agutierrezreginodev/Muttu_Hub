-- pgTAP: crm_bitacora migration (crm-module PR4, §4.2 tab 5): bitacora_cliente
-- append-only table. Mirrors registro_acceso (#137 D6 exception), NOT the
-- cliente/tarea/contacto/oportunidad pattern: no audit columns beyond
-- created_at, no deleted_at, no soft-delete RPC. Corrections are new entries,
-- never edits.
-- Source: sdd/crm-module/design (Engram obs #152), spec (obs #151) section
-- crm-bitacora (BIT1-BIT6), confirmed decision #150.5 (any crm.crear holder
-- writes to ANY visible client's bitacora; any crm.ver holder reads ALL
-- entries, no per-author/ownership restriction). Covers PR4 tasks 4.2/4.4.

begin;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'gerencia@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'sinver@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('22222222-2222-2222-2222-222222222222', 'Gerencia', 'gerencia@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador')),
  ('66666666-6666-6666-6666-666666666666', 'Sin Ver', 'sinver@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Colaborador role has crm.ver=true; force this ONE user's effective crm.ver
-- to false via permisos_override so "cannot read/write without crm.ver" is a
-- real, exercised path.
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '66666666-6666-6666-6666-666666666666';

-- cliente 1001: visible, responsable_interno_id pinned to Coordinador -- used
-- to prove Colaborador (unrelated to this cliente) can still write to its
-- bitacora (confirmed Decision 5: no ownership/responsable_interno gate).
-- cliente 1002: soft-deleted, used for the visibility-follow proof.
insert into public.cliente (id, nombre, estado, responsable_interno_id) overriding system value values
  (1001, 'Cliente Bitacora Visible', 'activo', '44444444-4444-4444-4444-444444444444'),
  (1002, 'Cliente Bitacora Borrado', 'activo', null);
update public.cliente set deleted_at = now() where id = 1002;

-- ---------------------------------------------------------------------------
-- 1-3: Coordinador (crm.crear + crm.ver, responsable_interno of 1001) can
-- append, autor_id is forced to the caller.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

with i as (
  insert into public.bitacora_cliente (cliente_id, autor_id, texto)
  values (1001, '44444444-4444-4444-4444-444444444444', 'Primer contacto telefonico')
  returning autor_id
)
select is((select autor_id from i), '44444444-4444-4444-4444-444444444444'::uuid,
  'coordinador can INSERT a bitacora entry with autor_id = own auth.uid()');

select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto)
    values (1001, '11111111-1111-1111-1111-111111111111', 'Suplantacion')$$,
  '42501', null, 'coordinador cannot spoof autor_id to another user (RLS with check rejects mismatch)');

-- Empirical finding (RED-phase discovery, not a schema defect): with autor_id
-- explicitly null, the RLS WITH CHECK `autor_id = (select auth.uid())`
-- evaluates to NULL (never TRUE), which Postgres rejects as a row-level
-- security violation (42501) before the column's own NOT NULL constraint is
-- reached for this authenticated-role statement. Both layers are real and
-- independently proven below: the RLS layer here, the column constraint via
-- a superuser (RLS-bypassing) attempt further down.
select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto) values (1001, null, 'sin autor')$$,
  '42501', null, 'coordinador omitting autor_id fails via RLS (null never satisfies autor_id = auth.uid()), never silently defaulted');

reset role;

-- Superuser bypasses RLS entirely, so this proves the column's own NOT NULL
-- constraint independently of the RLS layer above.
select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto) values (1001, null, 'sin autor, bypass RLS')$$,
  '23502', null, 'autor_id column itself is NOT NULL (superuser/RLS-bypass proof, independent of the policy check)');

-- ---------------------------------------------------------------------------
-- 4-5: Gerencia (crm.ver only, no crm.crear) can read but cannot write.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.bitacora_cliente where cliente_id = 1001),
  'gerencia (crm.ver) can SELECT the entry authored by coordinador');

select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto)
    values (1001, '22222222-2222-2222-2222-222222222222', 'Intento gerencia')$$,
  '42501', null, 'gerencia (no crm.crear) cannot INSERT a bitacora entry');

reset role;

-- ---------------------------------------------------------------------------
-- 6-7: Decision 5 -- ANY crm.crear holder writes to ANY visible client's
-- bitacora, with zero ownership/responsable_interno restriction. Colaborador
-- has no relationship whatsoever to cliente 1001 (responsable_interno is
-- Coordinador), yet succeeds.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select lives_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto)
    values (1001, '55555555-5555-5555-5555-555555555555', 'Nota de colaborador sin relacion con el cliente')$$,
  'colaborador (crm.crear, NOT the responsable_interno) can append to cliente 1001''s bitacora -- no ownership gate (Decision 5)');

select ok((select count(*) = 2 from public.bitacora_cliente where cliente_id = 1001),
  'cliente 1001 now has entries from 2 different, unrelated authors -- confirms open write access');

reset role;

-- ---------------------------------------------------------------------------
-- 8-9: Decision 5 -- read reach: any crm.ver holder sees every entry
-- regardless of author (no per-author restriction).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 2 from public.bitacora_cliente where cliente_id = 1001),
  'gerencia (crm.ver, authored nothing) reads ALL entries for cliente 1001, both authors');

select ok((select count(distinct autor_id) = 2 from public.bitacora_cliente where cliente_id = 1001),
  'both distinct authors'' entries are visible to a third-party crm.ver holder');

reset role;

-- ---------------------------------------------------------------------------
-- 10-11: user lacking crm.ver cannot read or write, even for a cliente that
-- exists and is not soft-deleted.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';

select ok((select count(*) = 0 from public.bitacora_cliente where cliente_id = 1001),
  'user without crm.ver (permisos_override forced false) sees zero bitacora entries');

select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto)
    values (1001, '66666666-6666-6666-6666-666666666666', 'Intento sin ver')$$,
  '42501', null, 'user without crm.ver cannot INSERT (cliente_visible requires crm.ver)');

reset role;

-- ---------------------------------------------------------------------------
-- 12-13: visibility follow -- entries of a soft-deleted cliente are invisible
-- via cliente_visible(), and new inserts against it are rejected too.
-- ---------------------------------------------------------------------------
insert into public.bitacora_cliente (id, cliente_id, autor_id, texto) overriding system value values
  (9001, 1002, '11111111-1111-1111-1111-111111111111', 'Nota previa a el borrado');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 0 from public.bitacora_cliente where cliente_id = 1002),
  'bitacora entries of a soft-deleted cliente are invisible (cliente_visible = false)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto)
    values (1002, '44444444-4444-4444-4444-444444444444', 'No deberia poder')$$,
  '42501', null, 'coordinador cannot INSERT into a soft-deleted cliente''s bitacora (cliente_visible = false)');

reset role;

select ok((select count(*) = 1 from public.bitacora_cliente where id = 9001),
  'the pre-existing entry (superuser bypass) was never touched by the soft-delete (structural check)');

-- ---------------------------------------------------------------------------
-- 14-15: CHECK rejects blank/whitespace-only texto.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto) values (1001, '44444444-4444-4444-4444-444444444444', '')$$,
  '23514', null, 'bitacora_cliente.texto CHECK rejects an empty string');

select throws_ok(
  $$insert into public.bitacora_cliente (cliente_id, autor_id, texto) values (1001, '44444444-4444-4444-4444-444444444444', '   ')$$,
  '23514', null, 'bitacora_cliente.texto CHECK rejects a whitespace-only string');

-- ---------------------------------------------------------------------------
-- 16-19: append-only genuinely -- UPDATE and DELETE rejected at the GRANT
-- layer for authenticated, not merely by a missing/rejecting policy. Proven
-- for BOTH a non-privileged role (coordinador) and the most-privileged role
-- (administrador, who holds crm.eliminar/crm.editar on every other domain
-- table) -- the absence of the grant is what blocks it, not permissions.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$update public.bitacora_cliente set texto = 'editado' where id = 9001$$,
  '42501', null, 'coordinador cannot UPDATE bitacora_cliente (no UPDATE grant at all, append-only)');

select throws_ok(
  $$delete from public.bitacora_cliente where id = 9001$$,
  '42501', null, 'coordinador cannot DELETE bitacora_cliente (no DELETE grant at all, append-only)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$update public.bitacora_cliente set texto = 'editado por admin' where id = 9001$$,
  '42501', null, 'administrador (crm.editar/crm.eliminar on every other domain table) STILL cannot UPDATE bitacora_cliente');

select throws_ok(
  $$delete from public.bitacora_cliente where id = 9001$$,
  '42501', null, 'administrador STILL cannot DELETE bitacora_cliente -- immutability is grant-layer, not role-layer');

reset role;

select ok((select texto from public.bitacora_cliente where id = 9001) = 'Nota previa a el borrado',
  'bitacora_cliente row content is unchanged after every rejected UPDATE attempt (superuser bypass check)');

-- ---------------------------------------------------------------------------
-- 20-23: structural proof of the grant-layer mechanism itself -- no
-- UPDATE/DELETE privilege exists in information_schema for EITHER role, the
-- same class of check used for oportunidad_servicio in PR3.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'bitacora_cliente'
             and grantee = 'authenticated' and privilege_type in ('UPDATE', 'DELETE')),
  'bitacora_cliente has no UPDATE/DELETE grant for authenticated at all');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'bitacora_cliente'
             and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE')),
  'bitacora_cliente has no UPDATE/DELETE grant for service_role either');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'bitacora_cliente'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'bitacora_cliente grants SELECT to authenticated');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'bitacora_cliente'
             and grantee = 'authenticated' and privilege_type = 'INSERT'),
  'bitacora_cliente grants INSERT to authenticated');

-- ---------------------------------------------------------------------------
-- 24-26: structural -- mirrors registro_acceso, not the domain-table pattern.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from pg_trigger
           where tgrelid = 'public.bitacora_cliente'::regclass and not tgisinternal),
  'bitacora_cliente has no audit trigger (mirrors registro_acceso, D6-style exception)');

select ok((select count(*) = 0 from information_schema.columns
           where table_schema = 'public' and table_name = 'bitacora_cliente'
             and column_name in ('updated_at', 'updated_by', 'deleted_at')),
  'bitacora_cliente has no updated_at/updated_by/deleted_at columns (append-only, created_at only)');

select ok((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.proname ilike '%bitacora%'
             and p.proname ilike '%delete%'),
  'no soft_delete_bitacora RPC exists anywhere -- corrections are new rows, never edits (BIT5)');

-- ---------------------------------------------------------------------------
-- 27-28: index exists for the cliente-scoped, newest-first feed the Bitacora
-- tab (PR8) will read.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 1 from pg_indexes
           where schemaname = 'public' and tablename = 'bitacora_cliente'
             and indexname = 'bitacora_cliente_idx'),
  'bitacora_cliente_idx exists (cliente_id, created_at desc)');

select ok((select count(*) = 0 from pg_class
           where relname = 'v_bitacora_cliente' and relnamespace = 'public'::regnamespace),
  'no v_bitacora_cliente view exists (matches registro_acceso, which has none either)');

select * from finish();

rollback;
