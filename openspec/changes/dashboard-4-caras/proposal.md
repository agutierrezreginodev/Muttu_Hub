# Proposal — Dashboard (4 faces)

Change slug: `dashboard-4-caras`

## Intent

Ship a top-level **Dashboard** surface at `/dashboard` that gives the team read-only,
aggregated visibility over data they already own in CRM and the shared tarea engine.
The dashboard is a **read/aggregation surface only** — it never writes domain data. It
presents four faces (tabs), each a focused rollup:

1. **Pipeline** — oportunidades by estado: counts, values, conversion. Source `oportunidad` (+ `oportunidad_servicio`). Kanban-independent.
2. **Tareas** — task throughput and status distribution, overdue, by estado/responsable. Source `tarea`/`v_tarea`. **Kanban-dependent.**
3. **Actividad Clientes** — recent client activity: bitácora, new contactos, oportunidad changes, per cliente. Source `bitacora_cliente`, `contacto`, `oportunidad`, `cliente`. Kanban-independent.
4. **Mi Resumen** — the current user's personal rollup: my open tareas, my compromisos (CRM/Ambos), my clients, my due-soon items. Source `tarea` (+ `cliente`). **Partially Kanban-dependent.**

## Scope — In

- New route group `/dashboard` with 4 nested segments mirroring the ficha-tabs pattern
  (`src/app/(app)/crm/[id]/ficha-tabs.tsx`): a `Link`-row tab nav reading `usePathname()`,
  each face a real deep-linkable route with its own server-side fetch. Default landing
  face = **Pipeline** (the ficha index-route convention: Pipeline is `segment: null`).
- A route gate layout (`/dashboard/layout.tsx`) that calls the `public.has_permission('dashboard','ver')`
  RPC, copying `(app)/crm/layout.tsx` exactly (redirect home on deny — never a distinct
  "forbidden" page).
- A `Dashboard` nav entry in `src/components/shell/app-shell.tsx` gated (UX-only) on the
  UI-side merged `dashboard.ver`, exactly like the existing CRM/Admin links.
- **RLS-aware aggregation as `security_invoker` SQL views** (and one UNION view for
  Actividad), one migration per face, each with a matching pgTAP test (CI-enforced,
  RED before GREEN). No `security definer` aggregation — see Approach.
- Server-component pages fetch (Promise.all over the new views) → client presentational
  components. A small **inline-SVG chart primitive library** built to the `dataviz`
  convention (KPI stat tile, horizontal bar, line/area, timeline list), one visual system,
  light+dark, accessible, with table-view fallbacks. No external chart dependency.
- All copy added to `src/messages/es.ts` under a new `dashboard` section.
- Unit (vitest + RTL), E2E (Playwright), and pgTAP coverage for every face.

## Scope — Out

- **No writes to any domain table.** The dashboard never creates/edits/deletes
  oportunidades, tareas, contactos, bitácora, or clientes. It only reads.
- **No new domain columns and no change to `tarea`/`oportunidad`/`bitacora` shape.**
  Aggregation is additive (views only).
- **No Documentos face** and no `documentos` data — out of scope for this change.
- **No `exportar` feature** (CSV/PDF export). `dashboard.exportar` exists in the grid but
  wiring export is a follow-up change; this change ships `ver`-gated read only.
- **No configurable date-range picker beyond the fixed per-face windows** designed here
  (a global range selector is a follow-up if requested).
- **No real-time / websocket refresh.** Faces are request-time server renders.
- **No new permission module.** `dashboard` already exists in the grid
  (`src/lib/permissions/schema.ts`, `private.permisos_grid_valid`, seeded roles).

## Capabilities (delta specs)

One spec per face, under `specs/`:

- `dashboard-pipeline` — Pipeline face requirements (PIPE1…).
- `dashboard-tareas` — Tareas face requirements (TAR1…).
- `dashboard-actividad` — Actividad Clientes face requirements (ACT1…).
- `dashboard-mi-resumen` — Mi Resumen face requirements (MR1…).

A cross-cutting `dashboard-shell` set of requirements (route gate, tabs, landing face,
nav entry, empty/loading, table fallback) is captured inside each face spec's shared
scenarios and in `design.md` §1–§3; it does not get its own capability folder.

## Approach (summary — full detail in design.md)

1. **Security boundary stays Postgres RLS.** Every aggregation is a `security_invoker`
   view (or a `security_invoker` SQL function where a date-range parameter is genuinely
   needed) that reads the existing `v_tarea` / `v_oportunidad` / `v_cliente` views or the
   base tables. Because `security_invoker` runs the aggregate under the caller's RLS,
   each viewer's numbers are computed from **only the rows they may see** — no re-implemented
   visibility predicate, no `security definer` bypass. A `dashboard.ver` holder who lacks
   `crm.ver` sees empty/zero aggregates on Pipeline/Actividad (RLS returns no rows), never
   an error.
2. **Route gate = `dashboard.ver`; data = each domain's own RLS.** `dashboard.ver` decides
   whether the surface renders at all (layout gate + nav visibility). The numbers inside
   each face are additionally filtered by the underlying domain RLS (`crm.ver` via
   `cliente_visible` for Pipeline/Actividad/Mi-Resumen-CRM; the origen-aware `tarea`
   policy — `crm.ver` OR `kanban.ver` — for Tareas/Mi-Resumen-full).
3. **Aggregate in SQL, not in the client.** Prefer one grouped view per metric family over
   N+1 per-cliente client queries. Pages do `Promise.all` over a handful of pre-aggregated
   views; presentational components receive already-summed rows.
4. **Charts are one system.** A single dataviz-validated palette + mark spec, reused by all
   four faces. The palette is run through `dataviz/scripts/validate_palette.js` (light AND
   dark) as a RED gate before any chart ships.

## Affected Areas

- `src/app/(app)/dashboard/**` — new route group (layout gate, tabs, 4 faces).
- `src/components/shell/app-shell.tsx` + `src/app/(app)/layout.tsx` — add `canAccessDashboard` nav flag (UX-only).
- `src/components/dashboard/**` — new chart primitives + presentational components.
- `src/lib/dashboard/queries.ts` — new read helpers over the aggregation views.
- `src/messages/es.ts` — new `dashboard` copy section.
- `supabase/migrations/*` — 4 new aggregation-view migrations (one per face family).
- `supabase/tests/*` — 4 new pgTAP files (one per migration).
- `e2e/dashboard-*.spec.ts` — new E2E specs.

## Risks

- **R1 — Kanban owns `tarea`.** A separate agent is actively building Kanban, which owns the
  shared `public.tarea` engine. Two faces (Tareas fully, Mi Resumen partially) read `tarea`.
  We design against `tarea` AS IT EXISTS TODAY and gate those faces behind an explicit
  re-validation checkpoint. See **Dependencies → Kanban Dependency** and `design.md`
  §"Kanban Dependency — confirm before apply".
- **R2 — Conversion needs an estado→outcome classification that does not exist yet.** Only
  `estado_oportunidad = 'abierta'` is seeded; won/lost codes are business-configured and
  unknown. Count-by-estado and value-by-estado work with ANY codes today, but the single
  "conversion %" headline needs a mapping of which codes are won vs lost. **Open question
  for the owner** (see Success Criteria / Open Questions).
- **R3 — Task throughput needs a completion timestamp `tarea` does not have.** `tarea` has
  only `updated_at`; there is no `completed_at`. Throughput-over-time is therefore an
  approximation (rows currently `cumplido`, bucketed by `updated_at`) unless Kanban adds a
  completion timestamp. Flagged as a Kanban dependency for the Tareas face.
- **R4 — `security_invoker` aggregate performance.** RLS predicates evaluate per row during
  aggregation. Acceptable for a single-org dataset; if volume grows, materialize (see
  design §Performance). Mitigated by the existing partial indexes
  (`tarea_vencidas_idx`, `oportunidad_cliente_idx`, `bitacora_cliente_idx`).
- **R5 — Chart accessibility/consistency drift.** Mitigated by a single validated palette,
  legend/direct-label rules, table-view fallback, and the palette validator as a RED gate.

## Rollback

Every artifact is additive and isolated under `/dashboard`, `src/components/dashboard`,
`src/lib/dashboard`, the new `dashboard` copy section, and 4 new view migrations. Rollback =
revert the feature branch(es); no existing table, column, RLS policy, or route is modified.
The aggregation views are `create view` only — dropping them affects nothing else. The
`dashboard` permission module already existed in the grid and is untouched.

## Dependencies

- **Existing (stable):** `v_tarea` (+ derived `vencido`), `v_oportunidad`, `v_cliente`,
  `v_usuario_activo`, `bitacora_cliente`, `contacto`, `oportunidad_servicio`,
  `private.has_permission`, `private.cliente_visible`, and the seeded `dashboard` permission
  module. None of these are modified.
- **Kanban Dependency (confirm before apply the Kanban-dependent faces):** A separate agent
  is building Kanban, which OWNS `public.tarea`. Do **not** assume its final shape. The
  faces that read `tarea` depend on the following `tarea` contract, which MUST be
  re-validated against Kanban's final design before applying PR-4 and the Kanban portion of
  PR-5:

  | Face | tarea surface depended on | Must re-validate |
  |------|---------------------------|------------------|
  | **Tareas** (fully blocked) | `estado` enum values (`borrador,pendiente,en_curso,cumplido,cancelado`); `origen` (`CRM,Kanban,Ambos`) filter semantics; `responsable_id`; `fecha_limite`; `v_tarea.vencido` derived column; `deleted_at` soft-delete; **completion timestamp (does not exist today)** for throughput | Whether estado values/labels change; whether Kanban adds/renames states; whether a `completed_at`/history exists to make throughput exact; whether `v_tarea` keeps `vencido` |
  | **Mi Resumen** (partially blocked) | Same as above, scoped to `responsable_id = auth.uid()`. The **CRM/Ambos compromiso** slice + **my clients** are Kanban-independent; the **full-origen "my tareas"** counts (which include `origen = Kanban`) are Kanban-dependent | Whether Kanban-origin tareas assigned to me are counted the same way; same estado/timestamp questions as Tareas |

  Pipeline and Actividad Clientes read `oportunidad`/`contacto`/`bitacora_cliente`/`cliente`
  only and are **fully independent of Kanban**.

## Success Criteria

- `/dashboard` renders for a `dashboard.ver` holder and redirects home for anyone else,
  proven by E2E, with the layout gate copying `(app)/crm/layout.tsx`.
- Each face's aggregates are computed by `security_invoker` views and are correct on pgTAP
  fixtures, AND return empty/zero for a caller who lacks the underlying domain permission
  (no error, no leak) — proven by pgTAP per face.
- Every new migration has a matching pgTAP test that fails RED before the view exists and
  passes GREEN after.
- Every metric renders with its designated chart type (design §Chart-type mapping), a
  legend for ≥2 series, selective direct labels, an empty state, a loading skeleton, and a
  table-view fallback; the palette passes `validate_palette.js` in light AND dark.
- No hardcoded UI strings; all copy in `src/messages/es.ts`.
- The Tareas face and the Kanban portion of Mi Resumen are NOT applied until the Kanban
  tarea contract is confirmed (tasks mark them BLOCKED).

### Open Questions for the owner

1. **Conversion classification (R2):** which `estado_oportunidad` codes count as *won* vs
   *lost* vs *open*? Until answered, Pipeline ships count/value-by-estado (works with any
   codes) and shows conversion as "pending classification" rather than a possibly-wrong
   number. Preferred resolution: a small classification (e.g. a `catalogo` metadata flag or
   an approved code convention).
2. **Throughput exactness (R3):** is an approximate throughput (by `updated_at` of `cumplido`
   rows) acceptable for launch, or should the Tareas face wait for a Kanban completion
   timestamp?
3. **Activity window:** default "recent activity" horizon — 30 days? And "due soon" horizon
   for Mi Resumen — 7 days? (Design assumes 30 / 7; confirm.)
4. **Landing face:** confirmed Pipeline as the default `/dashboard` landing?
