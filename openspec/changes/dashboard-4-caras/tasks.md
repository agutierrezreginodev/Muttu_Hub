# Tasks — Dashboard (4 faces)

Change slug: `dashboard-4-caras`

Strict TDD is active: every test task (RED) precedes its implementation task (GREEN). Every
migration has a pgTAP file authored and failing RED before the view exists. Slices are
stacked PRs, each ≤ ~400 changed lines. **Kanban-independent slices (PR-1…PR-3) ship first;
Kanban-dependent slices (PR-4, and the Kanban part of PR-5) are marked BLOCKED.**

Legend: `[ ]` todo · RED = write failing test first · GREEN = make it pass.

---

## PR-1 — Chart primitives + validated palette (foundation, Kanban-independent)

- [x] 1.1 Define the dataviz palette in `src/components/dashboard/charts/palette.ts`
      (categorical theme in fixed order, sequential hue, reserved status palette, light+dark
      surface tokens).
- [x] 1.2 **RED gate (Decision 6):** run `dataviz/scripts/validate_palette.js "<hex,…>"
--mode light` and `--mode dark`; fix every FAIL (lightness band, chroma floor, adjacent
      CVD ΔE ≥ 8, normal-vision floor ≥ 15, contrast) before proceeding. Record the passing
      palette. **Deviation:** the script does not exist in this repo (it is a Claude Code
      skill script, not a project file); validated manually instead, reasoning directly on
      the OKLCH L/C/H values already in `globals.css` — full reasoning recorded as a comment
      block in `palette.ts`.
- [x] 1.3 RED: unit tests for `KpiTile` (value + label + optional status color/icon, loading
      skeleton).
- [x] 1.4 GREEN: `KpiTile` primitive.
- [x] 1.5 RED: unit tests for `HorizontalBar` (one bar per datum, direct labels, ordered,
      single-series no-legend, ≥2-series legend, empty state, 4px rounded ends).
- [x] 1.6 GREEN: `HorizontalBar` inline-SVG primitive + hover tooltip.
- [x] 1.7 RED: unit tests for `LineArea` (weekly buckets, 2px line, markers, crosshair
      tooltip, empty state).
- [x] 1.8 GREEN: `LineArea` inline-SVG primitive.
- [x] 1.9 RED: unit tests for `TimelineList` and `ChartTableFallback` (table-view parity with
      the charted series).
- [x] 1.10 GREEN: `TimelineList` + `ChartTableFallback` primitives.
- [x] 1.11 Add `dashboard` copy scaffolding to `src/messages/es.ts` (nav, title, tab labels,
      shared empty/loading strings).

## PR-2 — Dashboard shell + Pipeline face (Kanban-independent)

- [x] 2.1 RED: `supabase/tests/dashboard_pipeline_views.sql` — assert `security_invoker` flag,
      authenticated SELECT-only grants, `crm.ver` holder gets expected aggregates, `crm.ver`-false
      (`permisos_override`) caller gets zero rows, and correct count/sum/filter values on fixtures.
      (Fails RED — views don't exist.)
- [x] 2.2 GREEN: migration `dashboard_pipeline_views` — `v_dashboard_pipeline_estado`,
      `v_dashboard_pipeline_totales`, `v_dashboard_pipeline_servicio` (design §4.1). pgTAP GREEN.
- [x] 2.3 RED: unit tests for `src/lib/dashboard/queries.ts` Pipeline helpers (map rows,
      default to zeros/`[]` on no data, `pendingClassification` flag for conversion).
- [x] 2.4 GREEN: Pipeline query helpers over the three views.
- [x] 2.5 GREEN: `/dashboard/layout.tsx` gate (copy `(app)/crm/layout.tsx`, `dashboard.ver`)
  - `dashboard-tabs.tsx` (`DASHBOARD_TABS = [Pipeline]` only) + heading.
- [x] 2.6 GREEN: add `canAccessDashboard` to `(app)/layout.tsx` and the Dashboard nav link to
      `app-shell.tsx` (UX-only, mirror CRM link).
- [x] 2.7 RED: RTL tests for the Pipeline presentational component (KPI tiles incl.
      "pendiente de clasificación", count chart, separate value chart, servicios chart, empty
      states, table fallback).
- [x] 2.8 GREEN: Pipeline `page.tsx` (server fetch via `Promise.all`) + presentational
      component; Pipeline copy in `es.ts`.
- [x] 2.9 RED→GREEN E2E `dashboard-access.spec.ts` (holder lands on Pipeline; non-holder
      redirected to `/`) and `dashboard-pipeline.spec.ts` (charts render; empty state).

## PR-3 — Actividad Clientes face (Kanban-independent)

- [x] 3.1 RED: `supabase/tests/dashboard_actividad_views.sql` — assert `security_invoker` on
      `v_actividad_cliente`, SELECT-only grant, each UNION branch RLS-filtered (activity on a
      soft-deleted/invisible cliente absent), `crm.ver`-false caller gets zero rows, correct row
      shape/values on fixtures. (Fails RED.)
- [x] 3.2 GREEN: migration `dashboard_actividad_views` — `v_actividad_cliente` UNION (design
      §4.3). pgTAP GREEN.
- [x] 3.3 RED: unit tests for Actividad query helpers (windowed feed, weekly volume, most-active
      clientes top-N + "Otros", new-contactos / new-oportunidades counts).
- [x] 3.4 GREEN: Actividad query helpers (window default 30 days).
- [x] 3.5 RED: RTL tests for the Actividad presentational component (timeline feed, weekly-volume
      line, most-active bar, new-count tiles, empty states, table fallback).
- [x] 3.6 GREEN: Actividad `page.tsx` + presentational component; append `Actividad` to
      `DASHBOARD_TABS`; Actividad copy in `es.ts`.
- [x] 3.7 RED→GREEN E2E `dashboard-actividad.spec.ts` (feed + charts render; empty for a
      no-crm.ver viewer).

## PR-4 — Tareas face — **COMPLETE (Kanban tarea contract re-confirmed at 4.0, unchanged from design.md)**

> Do NOT start until the Kanban Dependency checklist in `design.md` is re-validated against
> Kanban's final `tarea` contract (estados, origen semantics, `v_tarea.vencido`, `deleted_at`,
> and whether a completion timestamp exists for throughput). — Re-validated at task 4.0: no
> drift, no `completed_at` column, throughput stays "aproximado".

- [x] 4.0 **Gate:** confirm the Kanban `tarea` contract. If a completion timestamp now exists,
      switch throughput to it and drop the "aproximado" label before writing tests.
- [x] 4.1 RED: `supabase/tests/dashboard_tareas_views.sql` — `security_invoker` flags,
      SELECT-only grants, origen-aware scoping (`crm.ver`-only excludes `Kanban`; `kanban.ver`-only
      excludes `CRM`; `Ambos` counts for both), `vencido` filter correctness, throughput weekly
      buckets, correct values on fixtures. (Fails RED.)
- [x] 4.2 GREEN: migration `dashboard_tareas_views` — `v_dashboard_tareas_estado`,
      `v_dashboard_tareas_responsable`, `v_dashboard_tareas_throughput` (design §4.2). pgTAP GREEN.
- [x] 4.3 RED: unit tests for Tareas query helpers (estados read from data, responsable name
      join via `v_usuario_activo`, top-N + "Otros", overdue tile).
- [x] 4.4 GREEN: Tareas query helpers.
- [x] 4.5 RED: RTL tests for the Tareas presentational component (estado bar, overdue tile with
      status color+icon, throughput line labeled "aproximado" if applicable, responsable bar, empty
      states, table fallback).
- [x] 4.6 GREEN: Tareas `page.tsx` + presentational component; append `Tareas` to
      `DASHBOARD_TABS`; Tareas copy in `es.ts`.
- [x] 4.7 RED→GREEN E2E `dashboard-tareas.spec.ts`.

## PR-5 — Mi Resumen face — **PARTIAL: independent slice ships; Kanban slice BLOCKED**

> Independent slice (my-clients + CRM/Ambos compromisos) may ship now. The full-origen "my
> tareas" counts that include `origen = Kanban` are BLOCKED on the same Kanban confirmation as
> PR-4.

- [ ] 5.1 RED: `supabase/tests/dashboard_mi_resumen_views.sql` — `security_invoker` flags,
      SELECT-only grants, `auth.uid()` self-scoping (user A excludes user B's tareas/clientes),
      `mis_clientes` value, `vencido`/`vencen_pronto` filters, correct values on fixtures. (Fails RED.)
- [ ] 5.2 GREEN: migration `dashboard_mi_resumen_views` — `v_dashboard_mi_resumen_tareas`,
      `v_dashboard_mis_clientes` (design §4.4). pgTAP GREEN.
- [ ] 5.3 RED: unit tests for Mi Resumen query helpers — **independent slice** (my-clients,
      CRM/Ambos compromiso counts, agenda ordered by `fecha_limite`).
- [ ] 5.4 GREEN: Mi Resumen query helpers (independent slice) + agenda list query.
- [ ] 5.5 RED: RTL tests for the Mi Resumen presentational component — independent tiles
      (mis clientes, mis compromisos), by-estado bar, agenda list, empty states.
- [ ] 5.6 GREEN: Mi Resumen `page.tsx` + presentational component (independent slice); append
      `Mi Resumen` to `DASHBOARD_TABS`; Mi Resumen copy in `es.ts`.
- [ ] 5.7 **BLOCKED (Kanban):** extend Mi Resumen with the full-origen "my tareas" counts
      (open/overdue/due-soon including `origen = Kanban`) once the Kanban contract is confirmed —
      RED tests then GREEN.
- [ ] 5.8 RED→GREEN E2E `dashboard-mi-resumen.spec.ts` (independent slice; extend after 5.7).

---

## Review Workload Forecast

- **Estimated slices:** 5 stacked PRs.
- **Chained PRs recommended: Yes** — the change spans DB views (4 migrations + 4 pgTAP),
  shared chart primitives, a route group, 4 faces, and E2E. It MUST be chained, not one PR.
- **400-line budget risk per slice:**
  - PR-1 (primitives + palette): **Medium** — SVG primitives + tests can approach the budget;
    split `HorizontalBar`/`LineArea` from `TimelineList`/`ChartTableFallback` into two sub-PRs
    if it exceeds ~400 lines.
  - PR-2 (shell + Pipeline): **Medium–High** — gate + tabs + nav + 3 views + pgTAP + queries +
    page + E2E. If over budget, split the shell (2.5/2.6) from the Pipeline face (2.1–2.9).
  - PR-3 (Actividad): **Medium**.
  - PR-4 (Tareas): **Medium** — but BLOCKED regardless of size.
  - PR-5 (Mi Resumen): **Medium** — independent slice ~budget; the Kanban extension (5.7) is a
    separate follow-up PR.
- **Decision needed before apply: Yes** — (a) resolve delivery strategy for the chained PRs;
  (b) answer the four Open Questions in `proposal.md` (conversion classification, throughput
  exactness, activity/due-soon windows, landing face); (c) confirm the Kanban `tarea` contract
  before PR-4 and task 5.7.
- **Ordering guarantee:** PR-1 → PR-2 → PR-3 are Kanban-independent and unblock immediately.
  PR-4 and task 5.7 stay BLOCKED until Kanban confirmation; PR-5's independent slice (5.1–5.6,
  5.8) does not.
