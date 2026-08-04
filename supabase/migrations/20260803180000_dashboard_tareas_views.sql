-- Dashboard Tareas face aggregation views (dashboard-4-caras PR-4, task 4.2,
-- design.md §4.2, spec dashboard-tareas). `create view` only -- no
-- table/column/policy change.
--
-- Security boundary (design.md §1 Decision 1/2): every view is
-- `security_invoker = true`, aggregating over `v_tarea`. Because it runs
-- under the CALLER's privileges, the existing origen-aware `tarea_select`
-- RLS policy (supabase/migrations/20260728041925_audit.sql: `CRM` rows need
-- `crm.ver`, `Kanban` rows need `kanban.ver`, `Ambos` rows need EITHER)
-- applies BEFORE aggregation -- these views never re-implement that
-- predicate. `v_tarea` already filters `deleted_at is null` and derives
-- `vencido` (past `fecha_limite`, not in a terminal state --
-- supabase/migrations/20260728041925_audit.sql), so both are inherited for
-- free, never recomputed here (spec dashboard-tareas: "it is never
-- recomputed in app code, it reads the view's derived column").
--
-- Throughput (design.md §4.2, Kanban Dependency table): `tarea` has no
-- completion timestamp today, so `v_dashboard_tareas_throughput` buckets
-- `cumplido` rows by `updated_at` as a documented APPROXIMATION -- the query
-- layer/face label this "aproximado" until a real completion timestamp
-- exists (re-validated at task 4.0: confirmed still absent).
--
-- Route gate for the Dashboard surface (`dashboard.ver`) lives at the app
-- layer (`(app)/dashboard/layout.tsx`); these views apply no additional
-- gate of their own -- the underlying `tarea_select` RLS IS the data gate
-- (design.md §2 Decision 3).

create view public.v_dashboard_tareas_estado
with (security_invoker = true) as
  select estado,
         count(*)::bigint as tareas,
         count(*) filter (where vencido)::bigint as vencidas
  from public.v_tarea
  group by estado;

create view public.v_dashboard_tareas_responsable
with (security_invoker = true) as
  select responsable_id,
         count(*) filter (where estado in ('pendiente','en_curso'))::bigint as abiertas,
         count(*) filter (where vencido)::bigint as vencidas
  from public.v_tarea
  group by responsable_id;

-- Throughput: cumplido tareas bucketed by updated_at (APPROXIMATION, see
-- header comment above and design.md's Kanban Dependency table).
create view public.v_dashboard_tareas_throughput
with (security_invoker = true) as
  select date_trunc('week', updated_at)::date as semana,
         count(*)::bigint as cumplidas
  from public.v_tarea
  where estado = 'cumplido'
  group by 1;

revoke all on public.v_dashboard_tareas_estado from anon, authenticated;
revoke all on public.v_dashboard_tareas_responsable from anon, authenticated;
revoke all on public.v_dashboard_tareas_throughput from anon, authenticated;

grant select on public.v_dashboard_tareas_estado to authenticated;
grant select on public.v_dashboard_tareas_responsable to authenticated;
grant select on public.v_dashboard_tareas_throughput to authenticated;

grant select on public.v_dashboard_tareas_estado to service_role;
grant select on public.v_dashboard_tareas_responsable to service_role;
grant select on public.v_dashboard_tareas_throughput to service_role;
