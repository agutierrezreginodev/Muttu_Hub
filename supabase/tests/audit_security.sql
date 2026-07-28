-- pgTAP: audit migration — has_permission() resolution (override beats role,
-- malformed override fails closed), audit trigger, registro_acceso append-only
-- (D6 exception), soft-delete RPC permission enforcement, deactivated and
-- soft-deleted users blocked. Covers task 2.6.

begin;

select plan(36);

-- Fixtures (superuser). Claims pinned to admin so tarea.created_by (NOT NULL)
-- is filled by the audit trigger.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'override@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'override2@test.local'),
  ('88888888-8888-8888-8888-888888888888', 'malformed@test.local'),
  ('99999999-9999-9999-9999-999999999999', 'malformed2@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'deactivated@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ghost@test.local'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'inactivo@test.local');

insert into public.rol (nombre, permisos, activo) values ('Inactivo', '{
  "crm":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
  "kanban":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
  "documentos":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
  "dashboard":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
  "admin":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true}}', false);

insert into public.usuario (id, nombre, email, rol_id, permisos_override, activo, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador'), null, true, null),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador'), null, true, null),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador'), null, true, null),
  ('66666666-6666-6666-6666-666666666666', 'Override Grant', 'override@test.local',
   (select id from public.rol where nombre = 'Coordinador'),
   '{"crm":{"eliminar":true}}', true, null),
  ('77777777-7777-7777-7777-777777777777', 'Override Deny', 'override2@test.local',
   (select id from public.rol where nombre = 'Coordinador'),
   '{"crm":{"editar":false}}', true, null),
  ('88888888-8888-8888-8888-888888888888', 'Malformed Scalar', 'malformed@test.local',
   (select id from public.rol where nombre = 'Coordinador'),
   '{"crm":"pwned"}', true, null),
  ('99999999-9999-9999-9999-999999999999', 'Malformed Value', 'malformed2@test.local',
   (select id from public.rol where nombre = 'Coordinador'),
   '{"crm":{"ver":"banana"}}', true, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Deactivated Admin', 'deactivated@test.local',
   (select id from public.rol where nombre = 'Administrador'), null, false, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ghost Admin', 'ghost@test.local',
   (select id from public.rol where nombre = 'Administrador'), null, true, now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Inactive Role User', 'inactivo@test.local',
   (select id from public.rol where nombre = 'Inactivo'), null, true, null);

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.cliente (id, nombre, estado) overriding system value values
  (101, 'Cliente RPC', 'activo');

insert into public.tarea (id, titulo, origen, estado, responsable_id, cliente_id)
overriding system value values
  (201, 'Tarea RPC CRM', 'CRM', 'pendiente', '44444444-4444-4444-4444-444444444444', 101),
  (202, 'Tarea RPC Kanban', 'Kanban', 'pendiente', '44444444-4444-4444-4444-444444444444', 101);

-- One pre-existing registro row so SELECT assertions are meaningful.
insert into public.registro_acceso (usuario_id, evento) values
  ('11111111-1111-1111-1111-111111111111', 'login');

-- 1-11: has_permission() resolution.
set local role authenticated;

select is((select private.has_permission('admin','eliminar')), true,
  'administrador has admin.eliminar');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';
select is((select private.has_permission('crm','editar')), true,
  'coordinador has crm.editar via role');
select is((select private.has_permission('crm','eliminar')), false,
  'coordinador lacks crm.eliminar via role');

set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';
select is((select private.has_permission('crm','eliminar')), true,
  'override beats role in the grant direction (U4)');

set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777"}';
select is((select private.has_permission('crm','editar')), false,
  'override beats role in the deny direction (U4)');

set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';
select is((select private.has_permission('crm','eliminar')), false,
  'malformed override (scalar where object expected) falls through to role: fail-closed');

set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999"}';
select throws_ok(
  $$select private.has_permission('crm','ver')$$,
  '22P02', null, 'non-boolean override value raises a cast error: fail-closed, never a silent grant');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
select is(coalesce((select private.has_permission('admin','ver')), false), false,
  'deactivated user (activo = false) is blocked');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';
select is(coalesce((select private.has_permission('admin','ver')), false), false,
  'soft-deleted user is blocked');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
select is(coalesce((select private.has_permission('crm','ver')), false), false,
  'user whose role is deactivated is blocked');

set local request.jwt.claims to '{}';
select is(coalesce((select private.has_permission('crm','ver')), false), false,
  'anonymous claims resolve to deny');

-- 12-17: audit trigger fires and is tamper-proof.
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

insert into public.cliente (nombre) values ('AuditCo');
select ok((select created_by = '44444444-4444-4444-4444-444444444444'
           from public.cliente where nombre = 'AuditCo'),
  'audit trigger sets created_by from the caller on insert');

select ok((select updated_by = '44444444-4444-4444-4444-444444444444'
           from public.cliente where nombre = 'AuditCo'),
  'audit trigger sets updated_by from the caller on insert');

insert into public.cliente (nombre, created_by)
  values ('AuditCo2', '11111111-1111-1111-1111-111111111111');
select ok((select created_by = '44444444-4444-4444-4444-444444444444'
           from public.cliente where nombre = 'AuditCo2'),
  'caller-supplied created_by is overwritten by the trigger (tamper-proof)');

select pg_sleep(0.05);

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';
update public.cliente set nombre = 'AuditCo Editado' where nombre = 'AuditCo';

select ok((select updated_by = '11111111-1111-1111-1111-111111111111'
           from public.cliente where nombre = 'AuditCo Editado'),
  'audit trigger re-stamps updated_by on update');

select ok((select created_by = '44444444-4444-4444-4444-444444444444'
           from public.cliente where nombre = 'AuditCo Editado'),
  'created_by survives updates (trigger never touches it)');

select ok((select updated_at > created_at from public.cliente where nombre = 'AuditCo Editado'),
  'updated_at advances on update');

-- 18-19: audit columns and deleted_at are not writable by authenticated
-- (column-level grant exclusion; trigger and definer RPCs own them).
select throws_ok(
  $$update public.cliente set deleted_at = now() where nombre = 'AuditCo2'$$,
  '42501', null, 'authenticated cannot UPDATE deleted_at directly (RPC owns it)');

select throws_ok(
  $$update public.cliente set created_by = '11111111-1111-1111-1111-111111111111'
     where nombre = 'AuditCo2'$$,
  '42501', null, 'authenticated cannot UPDATE created_by directly (trigger owns it)');

-- 20-25: registro_acceso append-only.
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select ok((select count(*) = 0 from public.registro_acceso),
  'coordinador cannot read registro_acceso (admin.ver required)');

select lives_ok(
  $$insert into public.registro_acceso (usuario_id, evento)
    values ('44444444-4444-4444-4444-444444444444', 'login')$$,
  'authenticated can append their OWN registro row');

select throws_ok(
  $$insert into public.registro_acceso (usuario_id, evento)
    values ('11111111-1111-1111-1111-111111111111', 'login')$$,
  '42501', null, 'authenticated cannot append a registro row for another user');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select ok((select count(*) >= 2 from public.registro_acceso),
  'administrador can read registro_acceso (admin.ver)');

select throws_ok(
  $$update public.registro_acceso set evento = 'logout'$$,
  '42501', null, 'registro_acceso denies UPDATE (append-only)');

select throws_ok(
  $$delete from public.registro_acceso$$,
  '42501', null, 'registro_acceso denies DELETE (append-only)');

reset role;

-- 26: structural — the D6 exception table carries no audit trigger.
select ok((select count(*) = 0 from pg_trigger
           where tgrelid = 'public.registro_acceso'::regclass and not tgisinternal),
  'registro_acceso has no audit trigger (D6 exception: append-only, created_at only)');

-- 27-34: soft-delete RPC permission enforcement.
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$select public.soft_delete_cliente(101)$$,
  '42501', null, 'coordinador cannot soft-delete cliente (crm.eliminar required)');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$select public.soft_delete_cliente(101)$$,
  'administrador can soft-delete cliente via RPC');

select ok((select count(*) = 0 from public.v_cliente where id = 101),
  'soft-deleted cliente disappears from v_cliente');

reset role;

select ok((select deleted_at is not null from public.cliente where id = 101),
  'RPC stamped deleted_at on the row');

select ok((select updated_by = '11111111-1111-1111-1111-111111111111'
           from public.cliente where id = 101),
  'audit trigger stamped the RPC caller as updated_by');

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select throws_ok(
  $$select public.soft_delete_tarea(202)$$,
  '42501', null, 'colaborador cannot soft-delete Kanban tarea (kanban.eliminar required)');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$select public.soft_delete_tarea(201)$$,
  'administrador can soft-delete CRM tarea via RPC');

reset role;

select ok((select deleted_at is not null from public.tarea where id = 201),
  'RPC stamped deleted_at on the tarea row');

-- 35-36: blocked users get nothing at the RLS level, not just in the function.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

select ok((select count(*) = 0 from public.cliente),
  'deactivated user sees no clientes (RLS-level block)');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

select ok((select count(*) = 0 from public.tarea),
  'soft-deleted user sees no tareas (RLS-level block)');

select * from finish();

rollback;
