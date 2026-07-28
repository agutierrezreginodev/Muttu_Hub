-- pgTAP: identity migration — permisos_shape CHECK, rol/usuario RLS matrix,
-- FK index, RLS forced everywhere. Covers task 2.5 (identity portion).

begin;

select plan(19);

-- Fixtures (superuser; rolled back at the end of the file).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'gerencia@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'ghost@test.local');

insert into public.usuario (id, nombre, email, rol_id, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador'), null),
  ('22222222-2222-2222-2222-222222222222', 'Gerencia', 'gerencia@test.local',
   (select id from public.rol where nombre = 'Gerencia'), null),
  ('33333333-3333-3333-3333-333333333333', 'Ghost', 'ghost@test.local',
   (select id from public.rol where nombre = 'Administrador'), now());

-- 1-4: permisos_shape CHECK.
select throws_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Malo Modulo', '{
    "crm":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "kanban":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "documentos":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "dashboard":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true}}')$$,
  '23514', null, 'permisos grid missing a module key is rejected');

select throws_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Malo Tipo', '{
    "crm":{"ver":"yes","crear":true,"editar":true,"eliminar":true,"exportar":true},
    "kanban":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "documentos":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "dashboard":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "admin":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true}}')$$,
  '23514', null, 'non-boolean action value is rejected');

select throws_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Malo Accion', '{
    "crm":{"ver":true,"crear":true,"editar":true,"eliminar":true},
    "kanban":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "documentos":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "dashboard":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true},
    "admin":{"ver":true,"crear":true,"editar":true,"eliminar":true,"exportar":true}}')$$,
  '23514', null, 'missing action key is rejected');

select lives_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Valido', '{
    "crm":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "kanban":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "documentos":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "dashboard":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "admin":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false}}')$$,
  'full valid grid is accepted');

-- 5-8: rol RLS as Gerencia (no admin permissions).
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok(
  (select count(*) >= 4 from public.rol),
  'gerencia can SELECT rol (any authenticated may read roles)');

select throws_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Intruso', '{
    "crm":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "kanban":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "documentos":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "dashboard":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "admin":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false}}')$$,
  '42501', null, 'gerencia cannot INSERT rol (admin.crear required)');

with u as (update public.rol set descripcion = 'x' returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE rol (admin.editar required)');

select throws_ok(
  $$delete from public.rol$$,
  '42501', null, 'gerencia cannot DELETE rol (no DELETE grant anywhere)');

-- 9-11: rol RLS as Administrador.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$insert into public.rol (nombre, permisos) values ('Rol Temporal Admin', '{
    "crm":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "kanban":{"ver":true,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "documentos":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "dashboard":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false},
    "admin":{"ver":false,"crear":false,"editar":false,"eliminar":false,"exportar":false}}')$$,
  'administrador can INSERT rol');

with u as (update public.rol set descripcion = 'editado' where nombre = 'Rol Temporal Admin' returning 1)
select ok((select count(*) = 1 from u),
  'administrador can UPDATE rol');

select throws_ok(
  $$delete from public.rol where nombre = 'Rol Temporal Admin'$$,
  '42501', null, 'administrador cannot DELETE rol either (soft delete via RPC only)');

-- 12-15: usuario RLS as Gerencia.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok(
  (select count(*) >= 2 from public.usuario),
  'gerencia can SELECT active usuarios (internal directory)');

select ok(
  (select count(*) = 0 from public.usuario where id = '33333333-3333-3333-3333-333333333333'),
  'soft-deleted usuario is invisible to authenticated users');

select throws_ok(
  $$insert into public.usuario (id, nombre, email, rol_id)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Intruso', 'intruso@test.local',
            (select id from public.rol where nombre = 'Colaborador'))$$,
  '42501', null, 'gerencia cannot INSERT usuario (service role only)');

with u as (update public.usuario set nombre = 'x' returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE usuario (admin.editar required)');

-- 16-17: usuario RLS as Administrador.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

with u as (update public.usuario set nombre = 'Gerencia Editada'
           where id = '22222222-2222-2222-2222-222222222222' returning 1)
select ok((select count(*) = 1 from u),
  'administrador can UPDATE usuario');

select throws_ok(
  $$insert into public.usuario (id, nombre, email, rol_id)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Intruso', 'intruso@test.local',
            (select id from public.rol where nombre = 'Colaborador'))$$,
  '42501', null, 'even administrador cannot INSERT usuario via table (service role only)');

reset role;

-- 18-19: structural guarantees.
select has_index('public', 'usuario', 'usuario_rol_id_idx', 'FK index on usuario(rol_id) exists');

select ok(
  (select count(*) = 5
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('rol','usuario','cliente','tarea','registro_acceso')
     and c.relrowsecurity and c.relforcerowsecurity),
  'RLS is enabled and FORCED on all 5 tables');

select * from finish();

rollback;
