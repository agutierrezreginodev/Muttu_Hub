-- pgTAP: domain migration — borrador constraint (D4), origen CHECK,
-- cliente/tarea RLS matrix per role, vencido derived in v_tarea (D5),
-- security_invoker views. Covers task 2.5 (domain portion).

begin;

select plan(32);

-- Fixtures (superuser). Claims are pinned to the admin user so the audit
-- trigger can fill tarea.created_by (NOT NULL) on fixture inserts.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'gerencia@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('22222222-2222-2222-2222-222222222222', 'Gerencia', 'gerencia@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.cliente (id, nombre, estado, deleted_at) overriding system value values
  (101, 'Cliente Uno', 'activo', null),
  (102, 'Cliente Borrado', 'activo', now());

insert into public.tarea (id, titulo, origen, estado, responsable_id, cliente_id, fecha_limite, deleted_at)
overriding system value values
  (201, 'Tarea CRM',    'CRM',    'en_curso',  '44444444-4444-4444-4444-444444444444', 101, now() + interval '1 day', null),
  (202, 'Tarea Kanban', 'Kanban', 'en_curso',  '44444444-4444-4444-4444-444444444444', 101, now() + interval '1 day', null),
  (203, 'Tarea Ambos',  'Ambos',  'en_curso',  '44444444-4444-4444-4444-444444444444', 101, now() + interval '1 day', null),
  (204, 'Tarea Borrada','CRM',    'en_curso',  '44444444-4444-4444-4444-444444444444', 101, now() + interval '1 day', now()),
  (205, 'Tarea Vencida','CRM',    'pendiente', '44444444-4444-4444-4444-444444444444', 101, now() - interval '1 day', null),
  (206, 'Tarea Cumplida','CRM',   'cumplido',  '44444444-4444-4444-4444-444444444444', 101, now() - interval '1 day', null),
  (207, 'Tarea Futura', 'CRM',    'pendiente', '44444444-4444-4444-4444-444444444444', 101, now() + interval '1 day', null),
  (208, 'Tarea Sin Fecha','CRM',  'pendiente', '44444444-4444-4444-4444-444444444444', 101, null, null),
  (209, 'Tarea Borrador','CRM',   'borrador',  null, 101, null, null);

-- 1-5: borrador_sin_responsable (D4) + origen CHECK.
select lives_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Borrador Nuevo', 'CRM', 'borrador', null)$$,
  'borrador may have null responsable');

select throws_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Pendiente Sin Responsable', 'CRM', 'pendiente', null)$$,
  '23514', null, 'non-borrador without responsable is rejected');

select throws_ok(
  $$update public.tarea set estado = 'en_curso' where id = 209$$,
  '23514', null, 'cannot leave borrador without assigning a responsable (D4)');

select lives_ok(
  $$update public.tarea set estado = 'en_curso', responsable_id = '44444444-4444-4444-4444-444444444444'
    where id = 209$$,
  'leaving borrador with a responsable is allowed');

select throws_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Origen Malo', 'Email', 'pendiente', '44444444-4444-4444-4444-444444444444')$$,
  '23514', null, 'origen outside CRM/Kanban/Ambos is rejected');

-- 6-9: cliente RLS as Gerencia (ver only).
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.cliente where id = 101),
  'gerencia can SELECT live cliente (crm.ver)');

select ok((select count(*) = 0 from public.cliente where id = 102),
  'soft-deleted cliente is invisible');

select throws_ok(
  $$insert into public.cliente (nombre) values ('Cliente Intruso')$$,
  '42501', null, 'gerencia cannot INSERT cliente (crm.crear required)');

with u as (update public.cliente set nombre = nombre returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE cliente (crm.editar required)');

-- 10-11: cliente as Coordinador (ver/crear/editar).
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$insert into public.cliente (nombre) values ('Cliente Coord')$$,
  'coordinador can INSERT cliente');

with u as (update public.cliente set estado = 'standby' where id = 101 returning 1)
select ok((select count(*) = 1 from u),
  'coordinador can UPDATE cliente');

-- 12-13: cliente as Colaborador (crear but not editar).
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select lives_ok(
  $$insert into public.cliente (nombre) values ('Cliente Colab')$$,
  'colaborador can INSERT cliente (crm.crear)');

with u as (update public.cliente set nombre = nombre returning 1)
select ok((select count(*) = 0 from u),
  'colaborador cannot UPDATE cliente (editar seeded false; ownership RLS deferred to crm-module)');

-- 14-17: tarea RLS as Gerencia (ver on both modules, nothing else).
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 3 from public.tarea where id in (201, 202, 203)),
  'gerencia sees CRM, Kanban and Ambos tareas (origen-aware ver)');

select ok((select count(*) = 0 from public.tarea where id = 204),
  'soft-deleted tarea is invisible');

select throws_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Tarea Intrusa', 'CRM', 'pendiente', '44444444-4444-4444-4444-444444444444')$$,
  '42501', null, 'gerencia cannot INSERT tarea (crm.crear required)');

with u as (update public.tarea set titulo = titulo returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE tarea (editar required)');

-- 18-19: tarea as Coordinador.
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Tarea Coord', 'CRM', 'pendiente', '44444444-4444-4444-4444-444444444444')$$,
  'coordinador can INSERT tarea CRM');

with u as (update public.tarea set estado = 'cumplido' where id = 201 returning 1)
select ok((select count(*) = 1 from u),
  'coordinador can UPDATE tarea CRM');

-- 20-21: tarea as Colaborador.
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select lives_ok(
  $$insert into public.tarea (titulo, origen, estado, responsable_id)
    values ('Tarea Colab', 'Kanban', 'pendiente', '55555555-5555-5555-5555-555555555555')$$,
  'colaborador can INSERT tarea Kanban (kanban.crear)');

with u as (update public.tarea set titulo = titulo returning 1)
select ok((select count(*) = 0 from u),
  'colaborador cannot UPDATE tarea (editar seeded false)');

-- 22-26: vencido derived in v_tarea (D5), as Gerencia (security_invoker view).
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select is((select vencido from public.v_tarea where id = 205), true,
  'past fecha_limite + non-terminal estado => vencido');

select is((select vencido from public.v_tarea where id = 206), false,
  'past fecha_limite + terminal estado (cumplido) => not vencido');

select is((select vencido from public.v_tarea where id = 207), false,
  'future fecha_limite => not vencido');

select is((select vencido from public.v_tarea where id = 208), false,
  'null fecha_limite => not vencido');

select ok((select count(*) = 0 from public.v_tarea where id = 204),
  'v_tarea filters soft-deleted rows');

reset role;

-- 27-32: structural guarantees.
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_tarea' and relnamespace = 'public'::regnamespace),
  'v_tarea is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_cliente' and relnamespace = 'public'::regnamespace),
  'v_cliente is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_usuario_activo' and relnamespace = 'public'::regnamespace),
  'v_usuario_activo is a security_invoker view');

select ok((select count(*) = 0 from information_schema.columns
           where table_schema = 'public' and table_name = 'tarea' and column_name = 'vencido'),
  'vencido is never stored on tarea (derived only)');

select has_index('public', 'tarea', 'tarea_vencidas_idx',
  'partial index on tarea(fecha_limite) for overdue queries exists');

select ok((select count(*) = 1 from pg_constraint
           where conname = 'borrador_sin_responsable' and conrelid = 'public.tarea'::regclass),
  'borrador_sin_responsable constraint exists');

select * from finish();

rollback;
