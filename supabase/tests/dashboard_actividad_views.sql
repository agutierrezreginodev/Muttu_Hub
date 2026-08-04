-- pgTAP: dashboard_actividad_views migration (dashboard-4-caras PR-3, task
-- 3.1/3.2, design.md §4.3, spec dashboard-actividad). Asserts:
--   1. security_invoker flag on v_actividad_cliente.
--   2. authenticated: SELECT-only grant (no INSERT/UPDATE/DELETE).
--   3. a crm.ver holder gets the expected row shape/values across all 4
--      UNION branches (bitacora, contacto_nuevo, oportunidad_nueva,
--      oportunidad_gestion) for a visible cliente.
--   4. each branch is RLS-filtered: activity tied to a soft-deleted/invisible
--      cliente is entirely absent (visibility-follow, same property already
--      pgTAP-proven for contacto/oportunidad in crm_contacto_oportunidad_rls.sql).
--   5. a crm.ver-false (permisos_override) caller gets zero rows overall.
--
-- Judgment call disclosed: `oportunidad.fecha_ultima_gestion` is a plain
-- `date` column (design's own DDL) used ONLY as the "has been gestionada"
-- filter predicate for the `oportunidad_gestion` branch; that branch's
-- `ocurrido_en` is `updated_at` (timestamptz), matching design.md §4.3's own
-- sketch exactly. An oportunidad with `fecha_ultima_gestion` set therefore
-- contributes BOTH an `oportunidad_nueva` row (its creation) AND an
-- `oportunidad_gestion` row (its most recent gestion) -- two independent
-- events on the same record, not a duplicate.

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely -- same convention as
-- crm_contacto_oportunidad_rls.sql / dashboard_pipeline_views.sql).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('90000001-9000-9000-9000-900000000001', 'coord-actividad@test.local'),
  ('90000002-9000-9000-9000-900000000002', 'sinver-actividad@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('90000001-9000-9000-9000-900000000001', 'Coord Actividad', 'coord-actividad@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('90000002-9000-9000-9000-900000000002', 'Sin Ver Actividad', 'sinver-actividad@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Colaborador role has crm.ver=true by default seed; force this ONE user's
-- effective crm.ver to false via permisos_override (beats the role), same
-- "sinver" fixture pattern as every other pgTAP file in this repo.
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '90000002-9000-9000-9000-900000000002';

insert into public.cliente (id, nombre, estado) overriding system value values
  (3701, 'Cliente Actividad Visible', 'activo'),
  (3702, 'Cliente Actividad Borrado', 'activo');

-- Visible cliente (3701): one entry per UNION branch, plus a SECOND
-- oportunidad with fecha_ultima_gestion left null (proves the
-- oportunidad_gestion branch does NOT fire for an ungestionada oportunidad).
insert into public.bitacora_cliente (cliente_id, autor_id, texto) values
  (3701, '90000001-9000-9000-9000-900000000001', 'Nota de bitacora A');

insert into public.contacto (id, cliente_id, nombre) overriding system value values
  (3801, 3701, 'Contacto Actividad A');

insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (3901, 3701, 'Oportunidad A Sin Gestion'),
  (3902, 3701, 'Oportunidad A Gestionada');
update public.oportunidad set fecha_ultima_gestion = current_date where id = 3902;

-- Soft-deleted cliente (3702): one of each event type, THEN the cliente is
-- soft-deleted -- every branch must exclude these rows via cliente_visible,
-- even though none of the child rows themselves are touched.
insert into public.bitacora_cliente (cliente_id, autor_id, texto) values
  (3702, '90000001-9000-9000-9000-900000000001', 'Nota de bitacora invisible');
insert into public.contacto (id, cliente_id, nombre) overriding system value values
  (3803, 3702, 'Contacto Invisible');
insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (3903, 3702, 'Oportunidad Invisible');
update public.oportunidad set fecha_ultima_gestion = current_date where id = 3903;

update public.cliente set deleted_at = now() where id = 3702;

-- ---------------------------------------------------------------------------
-- 1-3: security_invoker flag + SELECT-only grant.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_actividad_cliente' and relnamespace = 'public'::regnamespace),
  'v_actividad_cliente is a security_invoker view');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_actividad_cliente'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_actividad_cliente has no INSERT/UPDATE/DELETE grant for authenticated');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_actividad_cliente'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_actividad_cliente');

-- ---------------------------------------------------------------------------
-- 4-10: crm.ver holder (Coordinador) -- correct shape/values per branch.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"90000001-9000-9000-9000-900000000001"}';

select ok((select count(*) = 5 from public.v_actividad_cliente where cliente_id = 3701),
  'crm.ver holder: cliente 3701 has exactly 5 activity rows across all 4 branches (1+1+2+1)');

select ok((select count(*) = 1 from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'bitacora'),
  'crm.ver holder: exactly 1 bitacora row for cliente 3701');

select ok((select actor_id = '90000001-9000-9000-9000-900000000001'::uuid
             and detalle = 'Nota de bitacora A'
           from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'bitacora'),
  'crm.ver holder: bitacora row carries the real autor_id (no audit-trigger overwrite) and detalle');

select ok((select count(*) = 1 from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'contacto_nuevo' and detalle = 'Contacto Actividad A'),
  'crm.ver holder: exactly 1 contacto_nuevo row for cliente 3701, correct detalle');

select ok((select count(*) = 2 from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'oportunidad_nueva'),
  'crm.ver holder: exactly 2 oportunidad_nueva rows for cliente 3701 (both oportunidades)');

select ok((select count(*) = 1 from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'oportunidad_gestion'
             and detalle = 'Oportunidad A Gestionada'),
  'crm.ver holder: exactly 1 oportunidad_gestion row for cliente 3701, tied to the gestionada oportunidad only');

select ok((select count(*) = 0 from public.v_actividad_cliente
           where cliente_id = 3701 and tipo = 'oportunidad_gestion'
             and detalle = 'Oportunidad A Sin Gestion'),
  'crm.ver holder: the ungestionada oportunidad never produces an oportunidad_gestion row');

reset role;

-- ---------------------------------------------------------------------------
-- 11: visibility follow -- soft-deleted cliente 3702 contributes ZERO rows
-- across all 4 branches, even though none of its bitacora/contacto/
-- oportunidad rows were themselves touched.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"90000001-9000-9000-9000-900000000001"}';

select ok((select count(*) = 0 from public.v_actividad_cliente where cliente_id = 3702),
  'crm.ver holder: soft-deleted cliente 3702 contributes zero activity rows (visibility-follow, all 4 branches)');

reset role;

select ok((select count(*) = 1 from public.bitacora_cliente
           where cliente_id = 3702 and texto = 'Nota de bitacora invisible'),
  'cliente 3702''s bitacora row itself still exists untouched (bitacora_cliente has no deleted_at column at all -- the cliente soft-delete hides it via cliente_visible only, checked via a superuser-bypass existence read)');

-- ---------------------------------------------------------------------------
-- 12-13: crm.ver-false (permisos_override) caller gets zero rows overall.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"90000002-9000-9000-9000-900000000002"}';

select ok((select count(*) = 0 from public.v_actividad_cliente),
  'crm.ver-false caller: v_actividad_cliente returns zero rows across every branch');

select ok((select count(*) = 0 from public.v_actividad_cliente where cliente_id = 3701),
  'crm.ver-false caller: even the OTHERWISE-visible cliente 3701 contributes zero rows');

reset role;

select * from finish();

rollback;
