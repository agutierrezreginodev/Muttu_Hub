-- Dashboard Mi Resumen face aggregation views (dashboard-4-caras PR-5, task
-- 5.2, design.md §4.4, spec dashboard-mi-resumen). `create view` only -- no
-- table/column/policy change.
--
-- Security boundary (design.md §1 Decision 1/2): every view is
-- `security_invoker = true`, so BOTH the domain RLS (origen-aware
-- `tarea_select` / `cliente_select`, supabase/migrations/20260728041925_audit.sql)
-- AND the self-scope filter (`= (select auth.uid())`) apply under the
-- CALLER's own privileges -- never re-implemented here. `v_tarea` already
-- filters `deleted_at is null` and derives `vencido`; `vencen_pronto` is
-- computed here on top of that same derived state (non-terminal + within
-- the 7-day horizon), exactly design.md §4.4's sketch.
--
-- Task 5.7 (full-origen): the Kanban `tarea` contract was re-confirmed
-- unchanged at apply time (no `completed_at`, no schema drift -- see
-- apply-progress) -- so `v_dashboard_mi_resumen_tareas` groups by BOTH
-- `estado` AND `origen` over the caller's full self-scoped rowset (every
-- origen the caller can see via tarea_select), not just CRM/Ambos. The query
-- layer derives the CRM-only "mis compromisos" headline and the full-origen
-- "mis tareas abiertas"/vencidas/vencen_pronto headlines from these same
-- rows -- no second view needed.
--
-- Route gate for the Dashboard surface (`dashboard.ver`) lives at the app
-- layer (`(app)/dashboard/layout.tsx`); these views apply no additional gate
-- of their own (design.md §2 Decision 3).

create view public.v_dashboard_mi_resumen_tareas
with (security_invoker = true) as
  select estado, origen,
         count(*)::bigint                        as tareas,
         count(*) filter (where vencido)::bigint as vencidas,
         count(*) filter (
           where fecha_limite is not null
             and fecha_limite >= now()
             and fecha_limite <  now() + interval '7 days'
             and estado not in ('cumplido','cancelado'))::bigint as vencen_pronto
  from public.v_tarea
  where responsable_id = (select auth.uid())
  group by estado, origen;

create view public.v_dashboard_mis_clientes
with (security_invoker = true) as
  select count(*)::bigint as mis_clientes
  from public.v_cliente
  where responsable_interno_id = (select auth.uid());

revoke all on public.v_dashboard_mi_resumen_tareas from anon, authenticated;
revoke all on public.v_dashboard_mis_clientes from anon, authenticated;

grant select on public.v_dashboard_mi_resumen_tareas to authenticated;
grant select on public.v_dashboard_mis_clientes to authenticated;

grant select on public.v_dashboard_mi_resumen_tareas to service_role;
grant select on public.v_dashboard_mis_clientes to service_role;
