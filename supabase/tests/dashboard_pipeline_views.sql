-- pgTAP: dashboard_pipeline_views migration (dashboard-4-caras PR-2, task
-- 2.1/2.2, design.md §4.1, spec dashboard-pipeline). Asserts:
--   1. security_invoker flag on all 3 views.
--   2. authenticated: SELECT-only grants (no INSERT/UPDATE/DELETE) on all 3.
--   3. a crm.ver holder gets the expected count/sum/filter aggregates.
--   4. a crm.ver-false (permisos_override) caller gets the empty-data result
--      for each shape (RLS is inherited from v_oportunidad /
--      oportunidad_servicio -- no separate gate lives in these views).
--
-- Judgment call disclosed: `v_dashboard_pipeline_totales` has NO `group by`
-- (design.md §4.1 -- "a single scalar row"), so it structurally ALWAYS
-- returns exactly one row, even over zero input rows (a plain aggregate
-- without GROUP BY never returns zero rows -- that is standard SQL
-- aggregate semantics, not a bug). For a crm.ver-false caller this means
-- "zero rows" is impossible for THIS view; the correct, equivalent
-- assertion is "the single row's aggregates are all zero"
-- (abiertas/valor_abiertas/total = 0), which is asserted below. The two
-- GROUPED views (`v_dashboard_pipeline_estado`,
-- `v_dashboard_pipeline_servicio`) DO return literally zero rows for a
-- crm.ver-false caller, and are asserted as such.

begin;

select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'coord-pipeline@test.local'),
  ('88888888-8888-8888-8888-888888888888', 'sinver-pipeline@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('77777777-7777-7777-7777-777777777777', 'Coord Pipeline', 'coord-pipeline@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('88888888-8888-8888-8888-888888888888', 'Sin Ver Pipeline', 'sinver-pipeline@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Colaborador role has crm.ver=true by default seed; force this ONE user's
-- effective crm.ver to false via permisos_override (beats the role), same
-- "sinver" fixture pattern as crm_contacto_oportunidad_rls.sql.
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '88888888-8888-8888-8888-888888888888';

-- estado_oportunidad already seeds 'abierta' (crm_contacto_oportunidad
-- migration); ganada/perdida are business-configured codes, not yet
-- confirmed by the owner (proposal.md Open Question 1) -- seed throwaway
-- codes local to this rolled-back transaction, same convention as
-- crm_contacto_oportunidad_rls.sql's own 'ganada' seed.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('estado_oportunidad', 'ganada', 'Ganada', 2),
  ('estado_oportunidad', 'perdida', 'Perdida', 3),
  ('servicio_interes', 'consultoria', 'Consultoria', 1),
  ('servicio_interes', 'capacitacion', 'Capacitacion', 2)
on conflict (tipo, codigo) do nothing;

insert into public.cliente (id, nombre, estado) overriding system value values
  (1701, 'Cliente Pipeline Visible', 'activo');

insert into public.oportunidad
  (id, cliente_id, nombre, valor_estimado_cop, estado) overriding system value values
  (1901, 1701, 'Abierta Uno', 1000.00, 'abierta'),
  (1902, 1701, 'Abierta Dos', 500.00, 'abierta'),
  (1903, 1701, 'Ganada Uno', 2000.00, 'ganada'),
  (1904, 1701, 'Perdida Uno', 300.00, 'perdida');

insert into public.oportunidad_servicio (oportunidad_id, cliente_id, servicio_codigo) values
  (1901, 1701, 'consultoria'),
  (1902, 1701, 'consultoria'),
  (1903, 1701, 'capacitacion');

-- ---------------------------------------------------------------------------
-- 1-6: security_invoker flag + SELECT-only grants on all 3 views.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_pipeline_estado' and relnamespace = 'public'::regnamespace),
  'v_dashboard_pipeline_estado is a security_invoker view');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_estado'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_pipeline_estado has no INSERT/UPDATE/DELETE grant for authenticated');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_pipeline_totales' and relnamespace = 'public'::regnamespace),
  'v_dashboard_pipeline_totales is a security_invoker view');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_totales'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_pipeline_totales has no INSERT/UPDATE/DELETE grant for authenticated');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_pipeline_servicio' and relnamespace = 'public'::regnamespace),
  'v_dashboard_pipeline_servicio is a security_invoker view');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_servicio'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_pipeline_servicio has no INSERT/UPDATE/DELETE grant for authenticated');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_estado'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_pipeline_estado');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_totales'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_pipeline_totales');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_pipeline_servicio'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_pipeline_servicio');

-- ---------------------------------------------------------------------------
-- 10-16: crm.ver holder (Coordinador) sees the expected aggregates.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777"}';

select ok((select count(*) = 3 from public.v_dashboard_pipeline_estado),
  'crm.ver holder: v_dashboard_pipeline_estado has exactly 3 estado rows (abierta/ganada/perdida)');

select ok((select oportunidades = 2 and valor_total = 1500.00
           from public.v_dashboard_pipeline_estado where estado = 'abierta'),
  'crm.ver holder: abierta estado row is count=2, valor_total=1500.00');

select ok((select oportunidades = 1 and valor_total = 2000.00
           from public.v_dashboard_pipeline_estado where estado = 'ganada'),
  'crm.ver holder: ganada estado row is count=1, valor_total=2000.00');

select ok((select oportunidades = 1 and valor_total = 300.00
           from public.v_dashboard_pipeline_estado where estado = 'perdida'),
  'crm.ver holder: perdida estado row is count=1, valor_total=300.00');

select ok((select abiertas = 2 and valor_abiertas = 1500.00 and total = 4
           from public.v_dashboard_pipeline_totales),
  'crm.ver holder: v_dashboard_pipeline_totales is abiertas=2, valor_abiertas=1500.00, total=4');

select ok((select oportunidades = 2 from public.v_dashboard_pipeline_servicio
           where servicio_codigo = 'consultoria'),
  'crm.ver holder: consultoria servicio row is count=2 (distinct oportunidades)');

select ok((select oportunidades = 1 from public.v_dashboard_pipeline_servicio
           where servicio_codigo = 'capacitacion'),
  'crm.ver holder: capacitacion servicio row is count=1');

reset role;

-- ---------------------------------------------------------------------------
-- 17-21: crm.ver-false (permisos_override) caller gets the empty-data shape.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888"}';

select ok((select count(*) = 0 from public.v_dashboard_pipeline_estado),
  'crm.ver-false caller: v_dashboard_pipeline_estado returns zero rows');

select ok((select count(*) = 0 from public.v_dashboard_pipeline_servicio),
  'crm.ver-false caller: v_dashboard_pipeline_servicio returns zero rows');

select ok((select count(*) = 1 from public.v_dashboard_pipeline_totales),
  'crm.ver-false caller: v_dashboard_pipeline_totales still returns exactly 1 row (ungrouped aggregate)');

select ok((select abiertas = 0 and valor_abiertas = 0.00 and total = 0
           from public.v_dashboard_pipeline_totales),
  'crm.ver-false caller: v_dashboard_pipeline_totales row is all-zero, not an error');

reset role;

select * from finish();

rollback;
