# Design — Dashboard (4 faces)

Change slug: `dashboard-4-caras`

This document proposes the architecture. The SQL blocks are **design sketches**, not
migrations — apply writes the real migrations (each RED-tested first).

---

## Kanban Dependency — confirm before apply

> **A separate agent is actively building Kanban, which OWNS `public.tarea`.** Two faces
> read `tarea`. Everything below is designed against `tarea` AS IT EXISTS TODAY
> (`supabase/migrations/20260728041924_domain.sql`): `estado in
(borrador,pendiente,en_curso,cumplido,cancelado)`, `origen in (CRM,Kanban,Ambos)`,
> `responsable_id uuid`, `fecha_limite timestamptz`, `deleted_at` soft-delete, and the
> `public.v_tarea` view with its derived `vencido` column. **Do NOT apply the
> Kanban-dependent slices until the checklist below is re-validated against Kanban's
> final contract.**

| Face           | Blocked?        | `tarea` surface it depends on                                                                                                                                                                                                                         | Re-validate before apply                                                                                                                                                                                                                                                                           |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipeline**   | No              | none                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                  |
| **Actividad**  | No              | none                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                  |
| **Tareas**     | **YES (fully)** | `estado` values & their labels; `origen` filter semantics; `responsable_id`; `fecha_limite`; `v_tarea.vencido`; `deleted_at`; **a completion timestamp — does NOT exist today** (throughput uses `updated_at` of `cumplido` rows as an approximation) | (a) Did Kanban change/rename/add estados? Read estados from data, not hardcoded. (b) Does `v_tarea` still exist and still expose `vencido`? (c) Did Kanban add `completed_at`/a status-history table? If yes, switch throughput to it and drop the "aproximado" label. (d) Any new `origen` value? |
| **Mi Resumen** | **PARTIAL**     | Same as Tareas, scoped `responsable_id = auth.uid()`. **Independent slice:** my-clients (`v_cliente.responsable_interno_id`) + CRM/Ambos compromisos. **Blocked slice:** full-origen "my tareas" counts that include `origen = Kanban`                | Re-validate the same estado/timestamp questions ONLY for the full-origen counts. The independent slice may ship first.                                                                                                                                                                             |

**Rule enforced in tasks.md:** PR-4 (Tareas) and the Kanban portion of PR-5 (Mi Resumen)
are marked `BLOCKED until Kanban tarea contract confirmed`. Pipeline, Actividad, and the
independent Mi-Resumen slice ship first.

---

## 1. Security boundary — `security_invoker` aggregation only

**Decision 1.** Every aggregation is a `security_invoker = true` view (or, where a
date-range parameter is unavoidable, a `security invoker` SQL function). We NEVER use
`security definer` for aggregation.

Rationale: Postgres RLS is the only security boundary. A `security_invoker` view executes
under the caller's privileges, so RLS on every referenced base table applies _before_
aggregation — each viewer's numbers are computed from only the rows their RLS permits. A
`security definer` aggregate would bypass RLS and force us to re-implement `cliente_visible`
/ the origen-aware tarea predicate by hand — a second, drift-prone copy of the security
model. We reuse the existing `v_tarea` / `v_oportunidad` / `v_cliente` / `v_usuario_activo`
views (themselves `security_invoker`) as the aggregation inputs wherever their columns
suffice, so the `deleted_at` filter and derived columns (`vencido`) are inherited, not
re-derived.

**Decision 2.** Consequence for empty/zero: a caller who lacks the underlying domain
permission gets **zero rows** from the view, which aggregates to zero counts / null-coalesced
zero sums — never an error. This is the same "denied SELECT returns empty, not a raise"
property the CRM query helpers already rely on (`src/lib/crm/queries.ts`). Pages therefore
follow the same convention: ignore `error`, default to zeros/`[]`.

## 2. Permission model — `dashboard.ver` gates the surface; domain RLS gates the data

**Decision 3.** The `dashboard` permission module **already exists** in the grid
(`src/lib/permissions/schema.ts`, `private.permisos_grid_valid`, seeded roles in
`supabase/seed.sql`: Administrador/Gerencia/Coordinador hold `dashboard.ver`, Colaborador
does not). We do **not** add a new module.

- **Route gate:** `/dashboard/layout.tsx` calls `supabase.rpc('has_permission', {modulo:'dashboard', accion:'ver'})` and `redirect('/')` on deny — a byte-for-byte copy of `(app)/crm/layout.tsx`. Defense in depth, not the boundary.
- **Nav visibility (UX only):** `(app)/layout.tsx` computes `canAccessDashboard = hasPermission(merged, 'dashboard','ver')` and passes it to `AppShell`, which shows/hides the Dashboard link exactly like the CRM/Admin links.
- **Data gate:** each face's aggregation view is additionally filtered by the underlying
  domain RLS. A `dashboard.ver` holder who lacks `crm.ver` sees the Dashboard shell but zeros
  on Pipeline/Actividad/Mi-Resumen-CRM (Decision 2). This is intended and correct.

## 3. Route structure — 4 nested segments, mirroring ficha-tabs

**Decision 4.** `/dashboard` is a route group with a gate layout, a `DashboardTabs`
client component (copying `ficha-tabs.tsx`: a `Link` row reading `usePathname()`, NOT a
shadcn tabs component — the kit ships none), and four faces as real routes:

```
src/app/(app)/dashboard/
  layout.tsx            gate (dashboard.ver) + <DashboardTabs/> + heading
  dashboard-tabs.tsx    Link-row tab nav; the SINGLE guard against dead-link tabs
  page.tsx              Pipeline face  (segment: null, DEFAULT LANDING)
  actividad/page.tsx    Actividad Clientes face
  tareas/page.tsx       Tareas face                     (Kanban-dependent)
  mi-resumen/page.tsx   Mi Resumen face                 (partially Kanban-dependent)
```

- **Default landing face = Pipeline** (the ficha convention: the index route `segment: null`
  is the first/most-executive face; Pipeline is Kanban-independent).
- Each face is its own server-component page doing `Promise.all` over the aggregation views,
  passing already-summed rows to client presentational components — no over-fetching, each
  face deep-linkable.
- **Dead-link guard:** the `DASHBOARD_TABS` array in `dashboard-tabs.tsx` is the single place
  a tab can be added. It grows PR by PR; a tab is NEVER added before its route exists
  (mirroring the `ficha-tabs.tsx` comment). Order: `[Pipeline, Actividad, Tareas, Mi Resumen]`
  — but Tareas/Mi-Resumen entries are appended only in their (Kanban-gated) PRs.

## 4. Per-face aggregation strategy (SQL sketches — DESIGN, not migrations)

All views: `with (security_invoker = true)`, `revoke all ... from anon, authenticated` then
`grant select ... to authenticated`, mirroring every existing `v_*` view.

### 4.1 Pipeline (`oportunidad`) — Kanban-independent

Count + value by estado (one grouped view; drives both the count chart and the value chart):

```sql
create view public.v_dashboard_pipeline_estado
with (security_invoker = true) as
  select estado,
         count(*)::bigint as oportunidades,
         coalesce(sum(valor_estimado_cop), 0)::numeric(14,2) as valor_total
  from public.v_oportunidad        -- security_invoker → oportunidad_select RLS (crm.ver) applies
  group by estado;
```

Headline totals (open count, open value) — a single scalar row:

```sql
create view public.v_dashboard_pipeline_totales
with (security_invoker = true) as
  select count(*) filter (where estado = 'abierta')::bigint            as abiertas,
         coalesce(sum(valor_estimado_cop) filter (where estado = 'abierta'), 0)::numeric(14,2) as valor_abiertas,
         count(*)::bigint                                              as total
  from public.v_oportunidad;
```

**Conversion (R2 / Open Question 1):** conversion needs an owner-confirmed classification of
won/lost estado codes. Only `abierta` is seeded; won/lost codes are business-configured. Until
confirmed, the query layer returns a `pendingClassification` flag and the tile renders the
"pendiente de clasificación" state. When confirmed, add a `v_dashboard_pipeline_conversion`
view (or pass the classified code lists as query params to a `security invoker` SQL function)
computing `won / (won + lost)`. **Count/value-by-estado work with ANY codes today** — only the
single conversion headline is gated on the classification.

Servicios distribution (optional, secondary):

```sql
create view public.v_dashboard_pipeline_servicio
with (security_invoker = true) as
  select os.servicio_codigo,
         count(distinct os.oportunidad_id)::bigint as oportunidades
  from public.oportunidad_servicio os              -- oportunidad_servicio_select RLS (cliente_visible)
  group by os.servicio_codigo;
```

### 4.2 Tareas (`v_tarea`) — **Kanban-dependent**

```sql
create view public.v_dashboard_tareas_estado
with (security_invoker = true) as
  select estado,
         count(*)::bigint                       as tareas,
         count(*) filter (where vencido)::bigint as vencidas
  from public.v_tarea                            -- origen-aware tarea RLS applies
  group by estado;

create view public.v_dashboard_tareas_responsable
with (security_invoker = true) as
  select responsable_id,
         count(*) filter (where estado in ('pendiente','en_curso'))::bigint as abiertas,
         count(*) filter (where vencido)::bigint                            as vencidas
  from public.v_tarea
  group by responsable_id;                       -- join v_usuario_activo for names in the query layer

-- Throughput (APPROXIMATION until a Kanban completion timestamp exists — see Kanban Dependency):
create view public.v_dashboard_tareas_throughput
with (security_invoker = true) as
  select date_trunc('week', updated_at)::date as semana,
         count(*)::bigint                      as cumplidas
  from public.v_tarea
  where estado = 'cumplido'
  group by 1;
```

Overdue headline reads `count(*) filter (where vencido)` from `v_dashboard_tareas_estado`
(no extra view). Estado values are read from the returned rows (not hardcoded) so a Kanban
state change does not silently drop a bar.

### 4.3 Actividad Clientes (UNION view) — Kanban-independent

A single `security_invoker` UNION view is the whole design: each branch inherits its base
table's RLS (all resolve through `private.cliente_visible` → `crm.ver`), so one query
replaces N+1 per-cliente reads.

```sql
create view public.v_actividad_cliente
with (security_invoker = true) as
      select 'bitacora'::text        as tipo, b.cliente_id, b.autor_id  as actor_id,
             b.texto                  as detalle, b.created_at           as ocurrido_en
        from public.bitacora_cliente b                    -- bitacora_cliente_select RLS
  union all
      select 'contacto_nuevo', c.cliente_id, c.created_by, c.nombre, c.created_at
        from public.contacto c where c.deleted_at is null -- contacto_select RLS
  union all
      select 'oportunidad_nueva', o.cliente_id, o.created_by, o.nombre, o.created_at
        from public.oportunidad o where o.deleted_at is null            -- oportunidad_select RLS
  union all
      select 'oportunidad_gestion', o.cliente_id, o.updated_by, o.nombre, o.updated_at
        from public.oportunidad o
        where o.deleted_at is null and o.fecha_ultima_gestion is not null;
```

Derived aggregates (query layer applies the window, default 30 days, via
`where ocurrido_en >= now() - interval '30 days'`):

- Recent feed: `order by ocurrido_en desc limit N`.
- Volume by week: `select date_trunc('week', ocurrido_en)::date, count(*) group by 1`.
- Most active clientes: `select cliente_id, count(*) group by 1 order by 2 desc limit N` (join `v_cliente` for names).
- New-this-period tiles: `count filter (where tipo = 'contacto_nuevo')`, `... 'oportunidad_nueva'`.

Optional: expose the windowed feed as a `security invoker` SQL function
`public.dashboard_actividad_reciente(p_desde timestamptz, p_limite int)` if the window
should be caller-controlled. Default design uses the view + a fixed window in the query layer.

### 4.4 Mi Resumen (`v_tarea` + `v_cliente`, self-scoped by `auth.uid()`) — **partial**

```sql
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
  where responsable_id = (select auth.uid())       -- self-scope; RLS still applies underneath
  group by estado, origen;

create view public.v_dashboard_mis_clientes           -- INDEPENDENT slice
with (security_invoker = true) as
  select count(*)::bigint as mis_clientes
  from public.v_cliente
  where responsable_interno_id = (select auth.uid());
```

- **Independent slice (ships first):** `v_dashboard_mis_clientes`; and the CRM compromiso
  counts read from `v_dashboard_mi_resumen_tareas` filtered to `origen in ('CRM','Ambos')` in
  the query layer.
- **Kanban-dependent slice (blocked):** the full-origen totals that include `origen = 'Kanban'`.
- Agenda list: `v_tarea` where `responsable_id = auth.uid()`, non-terminal, `order by
fecha_limite asc` (query layer — reuses the `getProximoCompromiso` shape, generalized).

## 5. Chart-type mapping (dataviz convention)

The form is chosen by the data's job (dataviz "choosing a form"): magnitude → bar; identity →
categorical color; change-over-time → line/area; a single headline → stat tile (not a chart).
**Color is chosen last** and validated. Categorical hues assigned in fixed order, never cycled;
one axis per chart (never dual-axis); status palette reserved for overdue/critical only.

| Face       | Metric                                                           | Chart / mark                        | dataviz notes                                                        |
| ---------- | ---------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Pipeline   | open count, total value COP                                      | **stat tiles**                      | headline numbers, no plot                                            |
| Pipeline   | conversion %                                                     | **stat tile**                       | "pendiente de clasificación" until R2 resolved                       |
| Pipeline   | oportunidades por estado (count)                                 | **horizontal bar**                  | single series → no legend; direct labels; ordered by catalog `orden` |
| Pipeline   | valor por estado (COP)                                           | **horizontal bar (separate chart)** | NOT dual-axis with count                                             |
| Pipeline   | por servicio_interes                                             | **horizontal bar** top N + "Otros"  | 9th+ never a new hue                                                 |
| Tareas     | total open, overdue, completed-period                            | **stat tiles**                      | overdue uses reserved status color + icon + label                    |
| Tareas     | count por estado                                                 | **horizontal bar**                  | estados read from data                                               |
| Tareas     | throughput (weekly cumplido)                                     | **line/area over time**             | labeled "aproximado" until completion timestamp                      |
| Tareas     | open por responsable                                             | **horizontal bar** top N + "Otros"  | overdue distinguishable                                              |
| Actividad  | nuevos contactos, nuevas oportunidades                           | **stat tiles**                      | window-scoped                                                        |
| Actividad  | actividad por semana                                             | **line/area over time**             | all event types                                                      |
| Actividad  | clientes más activos                                             | **horizontal bar** top N + "Otros"  | ranked magnitude                                                     |
| Actividad  | recent activity                                                  | **timeline list** (not a chart)     | type badge + cliente + actor + relative time                         |
| Mi Resumen | mis abiertas, compromisos, vencen pronto, vencidas, mis clientes | **stat tiles**                      | overdue uses status color + icon                                     |
| Mi Resumen | mis tareas por estado                                            | **horizontal bar (small)**          | single series                                                        |
| Mi Resumen | mi agenda                                                        | **list** ordered by fecha_limite    | overdue flagged                                                      |

**Decision 5 — chart implementation: inline-SVG primitives, no new dependency.** No charting
library is installed (verified: `package.json` has no recharts/d3/chart.js). The chart set here
is simple (bars, one line/area, KPI tiles, lists). We build a small primitive module
`src/components/dashboard/charts/` (KPI tile, `HorizontalBar`, `LineArea`, `TimelineList`,
`ChartTableFallback`) as inline SVG following the dataviz mark specs (thin marks; 4px rounded
data-ends on the baseline; 2px lines; ≥8px markers; 2px surface gap between fills; recessive
grid/axes; hover tooltip; legend for ≥2 series; selective direct labels). Tradeoff: we own the
rendering (full control over palette/marks/light-dark/a11y, zero bundle cost) at the cost of
writing the primitives ourselves — proportionate here and avoids a heavy dependency for four
simple faces. A single palette lives in `src/components/dashboard/charts/palette.ts`
(dataviz categorical theme + sequential hue + reserved status palette, light+dark surfaces).

**Decision 6 — palette is validated as a RED gate.** Before any chart ships, run
`dataviz/scripts/validate_palette.js "<hex,…>" --mode light` and `--mode dark` against the
chart surfaces. Fix any FAIL (lightness band, chroma floor, adjacent-pair CVD ΔE ≥ 8,
normal-vision floor ≥ 15, contrast) before GREEN. This is a task, not a suggestion.

## 6. RLS scoping per face (summary)

| Face       | View input                                      | Effective data gate                                                                  |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Pipeline   | `v_oportunidad`, `oportunidad_servicio`         | `oportunidad_select` / `oportunidad_servicio_select` → `cliente_visible` → `crm.ver` |
| Tareas     | `v_tarea`                                       | origen-aware `tarea_select` → `crm.ver` (CRM), `kanban.ver` (Kanban), either (Ambos) |
| Actividad  | `v_actividad_cliente` (UNION)                   | each branch's base RLS → `cliente_visible` → `crm.ver`                               |
| Mi Resumen | `v_tarea` + `v_cliente`, `where … = auth.uid()` | self-scope by `auth.uid()` AND the same tarea/cliente RLS underneath                 |

Route gate for all four: `dashboard.ver` (layout). No face's numbers can exceed what the
viewer's domain RLS already permits.

## 7. Performance considerations

- RLS predicates evaluate per row during aggregation. For a single-org dataset this is
  acceptable. Existing partial indexes help: `tarea_vencidas_idx (fecha_limite) where
deleted_at is null`, `oportunidad_cliente_idx where deleted_at is null`,
  `bitacora_cliente_idx (cliente_id, created_at desc)`, `oportunidad_servicio_cliente_idx`.
- Avoid N+1: faces read a handful of pre-aggregated views via `Promise.all`, never a
  per-cliente loop in the client. The Actividad UNION view replaces four per-cliente queries
  with one.
- **Materialization escape hatch (design, not built):** if volume grows, the grouped views can
  become materialized views refreshed on a schedule — but a materialized view CANNOT be
  `security_invoker` (it runs as its owner), so it would require re-implementing the RLS
  predicates as explicit `where` clauses. We do NOT materialize now; documented as the future
  path with its security caveat. Request-time `security_invoker` views are the launch design.
- React Server Components fetch at request time; `getSessionContext`/`React.cache` patterns
  already in the codebase dedupe the session lookup across layout+page.

## 8. Migration Plan (aggregation views + pgTAP test names)

Each migration is `create view` only (+ grants); no table/column/policy change. Each has a
matching pgTAP file (CI-enforced, RED before GREEN). Timestamps assigned at apply after the
latest existing migration (`20260728200200`).

| #   | Migration (logical)                           | Views created                                                                                  | pgTAP test file                                 |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| M1  | `dashboard_pipeline_views`                    | `v_dashboard_pipeline_estado`, `v_dashboard_pipeline_totales`, `v_dashboard_pipeline_servicio` | `supabase/tests/dashboard_pipeline_views.sql`   |
| M2  | `dashboard_actividad_views`                   | `v_actividad_cliente` (UNION)                                                                  | `supabase/tests/dashboard_actividad_views.sql`  |
| M3  | `dashboard_tareas_views` **(Kanban-blocked)** | `v_dashboard_tareas_estado`, `v_dashboard_tareas_responsable`, `v_dashboard_tareas_throughput` | `supabase/tests/dashboard_tareas_views.sql`     |
| M4  | `dashboard_mi_resumen_views` **(partial)**    | `v_dashboard_mi_resumen_tareas`, `v_dashboard_mis_clientes`                                    | `supabase/tests/dashboard_mi_resumen_views.sql` |

Each pgTAP file MUST assert (mirroring `crm_contacto_oportunidad_rls.sql`):

1. **`security_invoker` flag** present on each view (`pg_class.reloptions like '%security_invoker=true%'`).
2. **Grants:** `authenticated` has SELECT, and NO INSERT/UPDATE/DELETE, on each view.
3. **RLS scoping:** with fixtures spanning clientes/tareas across roles — a `crm.ver` holder
   gets the expected non-zero aggregates; a caller with `crm.ver` forced false via
   `permisos_override` gets **zero rows / zero counts** (the `sinver` fixture pattern already
   used in `crm_contacto_oportunidad_rls.sql`).
4. **Correct values** on known fixtures (count/sum/filter results match hand-computed expectations).
5. **Tareas M3:** origen-aware scoping — a `crm.ver`-only user's counts exclude `origen='Kanban'`;
   a `kanban.ver`-only user's counts exclude `origen='CRM'`; `Ambos` counts for both.
6. **Mi Resumen M4:** `auth.uid()` self-scoping — user A's rollup excludes user B's tareas/clientes.
7. **Actividad M2:** each UNION branch is RLS-filtered — activity on a soft-deleted cliente is absent.

## 9. Test Plan

- **pgTAP (DB, strict TDD RED→GREEN):** the four files above. Written and RED before each
  view migration exists; GREEN after.
- **vitest + RTL (unit):** chart primitives (bar geometry, direct-label rendering, legend for
  ≥2 series, empty state, table fallback, status-color+icon for overdue); each face's
  presentational component (renders tiles/charts from summed props, empty states, "pendiente
  de clasificación" for conversion); query helpers (map rows, default to zeros/`[]` on no data).
- **Playwright (E2E):**
  - `dashboard-access.spec.ts` — `dashboard.ver` holder reaches `/dashboard` and lands on
    Pipeline; a non-holder is redirected to `/`.
  - `dashboard-pipeline.spec.ts` — Pipeline renders KPIs + charts for seeded data; empty state
    for a viewer without visible oportunidades.
  - `dashboard-actividad.spec.ts` — feed + charts render; empty for a no-crm.ver viewer.
  - Tareas / Mi-Resumen E2E authored with the faces (Tareas gated on Kanban confirmation).
- **Palette validator:** `validate_palette.js` light + dark, RED gate before charts ship
  (Decision 6).

## 10. Copy (`src/messages/es.ts`)

Add a `dashboard` section: `nav` ("Panel"/"Dashboard"), `title`, per-tab labels
(`pipeline`, `actividad`, `tareas`, `miResumen`), per-face metric labels, empty-state strings
per chart, loading, `conversionPendiente` ("Pendiente de clasificación"),
`throughputAproximado`, table-fallback toggle label, and status labels (vencidas). No
hardcoded strings anywhere in the components.
