-- Dashboard Pipeline face aggregation views (dashboard-4-caras PR-2, task
-- 2.2, design.md §4.1, spec dashboard-pipeline). `create view` only -- no
-- table/column/policy change.
--
-- Security boundary (design.md §1 Decision 1/2): every view is
-- `security_invoker = true`, aggregating over `v_oportunidad` /
-- `oportunidad_servicio`. Because it runs under the CALLER's privileges,
-- the existing `oportunidad_select` / `oportunidad_servicio_select` RLS
-- policies (both gated by `private.cliente_visible` -> `crm.ver`,
-- supabase/migrations/20260728193509_crm_contacto_oportunidad.sql) apply
-- BEFORE aggregation -- a caller without `crm.ver` never sees a row from
-- these base relations, so these views never re-implement that visibility
-- predicate. `v_oportunidad` already filters `deleted_at is null`
-- (supabase/migrations/20260728193509_crm_contacto_oportunidad.sql), so
-- soft-deleted oportunidades are excluded here for free.
--
-- Route gate for the Dashboard surface (`dashboard.ver`) lives at the app
-- layer (`(app)/dashboard/layout.tsx`); these views apply no additional
-- gate of their own -- the underlying domain RLS IS the data gate
-- (design.md §2 Decision 3). A `dashboard.ver` holder without `crm.ver`
-- gets the zero/empty shape from every view below, never an error.

create view public.v_dashboard_pipeline_estado
with (security_invoker = true) as
  select estado,
         count(*)::bigint as oportunidades,
         coalesce(sum(valor_estimado_cop), 0)::numeric(14,2) as valor_total
  from public.v_oportunidad
  group by estado;

create view public.v_dashboard_pipeline_totales
with (security_invoker = true) as
  select count(*) filter (where estado = 'abierta')::bigint as abiertas,
         coalesce(sum(valor_estimado_cop) filter (where estado = 'abierta'), 0)::numeric(14,2) as valor_abiertas,
         count(*)::bigint as total
  from public.v_oportunidad;

create view public.v_dashboard_pipeline_servicio
with (security_invoker = true) as
  select os.servicio_codigo,
         count(distinct os.oportunidad_id)::bigint as oportunidades
  from public.oportunidad_servicio os
  group by os.servicio_codigo;

revoke all on public.v_dashboard_pipeline_estado from anon, authenticated;
revoke all on public.v_dashboard_pipeline_totales from anon, authenticated;
revoke all on public.v_dashboard_pipeline_servicio from anon, authenticated;

grant select on public.v_dashboard_pipeline_estado to authenticated;
grant select on public.v_dashboard_pipeline_totales to authenticated;
grant select on public.v_dashboard_pipeline_servicio to authenticated;

grant select on public.v_dashboard_pipeline_estado to service_role;
grant select on public.v_dashboard_pipeline_totales to service_role;
grant select on public.v_dashboard_pipeline_servicio to service_role;
