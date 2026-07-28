-- pgTAP: public.has_permission() wrapper (20260728060000_admin_permission_wrapper.sql).
--
-- The wrapper is a thin SECURITY INVOKER forward to private.has_permission()
-- (already exhaustively covered by supabase/tests/audit_security.sql: override
-- beats role, malformed override fails closed, deactivated/soft-deleted users
-- denied). This file only proves the wrapper (a) actually delegates to live,
-- dynamic permission state rather than a static value, and (b) carries the
-- correct grants: authenticated can call it, anon cannot.

begin;

select plan(4);

insert into auth.users (id, email) values
  ('12121212-1212-1212-1212-121212121212', 'admin-wrapper@test.local'),
  ('34343434-3434-3434-3434-343434343434', 'colab-wrapper@test.local'),
  ('56565656-5656-5656-5656-565656565656', 'override-wrapper@test.local');

insert into public.usuario (id, nombre, email, rol_id, permisos_override) values
  ('12121212-1212-1212-1212-121212121212', 'Admin Wrapper', 'admin-wrapper@test.local',
   (select id from public.rol where nombre = 'Administrador'), null),
  ('34343434-3434-3434-3434-343434343434', 'Colaborador Wrapper', 'colab-wrapper@test.local',
   (select id from public.rol where nombre = 'Colaborador'), null),
  ('56565656-5656-5656-5656-565656565656', 'Override Wrapper', 'override-wrapper@test.local',
   (select id from public.rol where nombre = 'Colaborador'), '{"admin":{"ver":true}}');

set local role authenticated;

-- 1: Administrador really does resolve true through the wrapper (delegates
-- to live role data, not a hardcoded result).
set local request.jwt.claims to '{"sub":"12121212-1212-1212-1212-121212121212"}';
select is((select public.has_permission('admin', 'ver')), true,
  'wrapper: administrador has admin.ver');

-- 2: Colaborador (seeded fail-closed on admin.*) resolves false through the
-- wrapper — same fail-closed default as the private function.
set local request.jwt.claims to '{"sub":"34343434-3434-3434-3434-343434343434"}';
select is((select public.has_permission('admin', 'ver')), false,
  'wrapper: colaborador lacks admin.ver by default');

-- 3: per-user override still wins through the wrapper (proves the wrapper
-- forwards both arguments and re-evaluates per caller, not a cached value).
set local request.jwt.claims to '{"sub":"56565656-5656-5656-5656-565656565656"}';
select is((select public.has_permission('admin', 'ver')), true,
  'wrapper: override grants admin.ver even though the role denies it');

reset role;

-- 4: anon has no EXECUTE grant on the wrapper.
set local role anon;
select throws_ok(
  $$select public.has_permission('admin', 'ver')$$,
  '42501', null,
  'anon cannot execute public.has_permission (no EXECUTE grant)');
reset role;

select * from finish();

rollback;
