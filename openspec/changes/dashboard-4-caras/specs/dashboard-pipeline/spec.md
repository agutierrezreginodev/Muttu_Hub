# Spec — Dashboard: Pipeline face

Capability: `dashboard-pipeline`
Change: `dashboard-4-caras`
Source: `oportunidad` (+ `oportunidad_servicio`). **Kanban-independent.**

## ADDED Requirements

### Requirement: Pipeline is reachable only through the dashboard gate and is the default landing face

The Pipeline face SHALL be the default landing face of `/dashboard` (the ficha
index-route convention: `segment: null`), and SHALL render only after the shared
`/dashboard/layout.tsx` gate confirms `has_permission('dashboard','ver')`.

#### Scenario: dashboard.ver holder lands on Pipeline

- **GIVEN** an authenticated user whose merged permissions include `dashboard.ver`
- **WHEN** they navigate to `/dashboard`
- **THEN** the Pipeline face renders as the active tab
- **AND** the tab nav marks Pipeline with `aria-current="page"`.

#### Scenario: user without dashboard.ver is redirected

- **GIVEN** an authenticated user whose merged permissions do NOT include `dashboard.ver`
- **WHEN** they navigate to `/dashboard`
- **THEN** they are redirected to `/` (home), with no distinct "forbidden" page and no
  confirmation that the route exists — identical to the CRM/Admin gate behavior.

### Requirement: Pipeline headline KPIs

The face SHALL present, as stat tiles (no plot), three headline numbers computed over
oportunidades the viewer may see: **open opportunities** (count where `estado = 'abierta'`),
**total pipeline value** (sum of `valor_estimado_cop` over open opportunities, in COP), and
**conversion** (see the conversion requirement).

#### Scenario: KPIs reflect only visible oportunidades

- **GIVEN** the org has open oportunidades across several clientes and the viewer holds `crm.ver`
- **WHEN** the Pipeline face loads
- **THEN** the open-count and total-value tiles reflect exactly the non-deleted
  oportunidades the viewer's RLS permits (computed by the `security_invoker` aggregation
  view), formatted in COP for the value tile.

#### Scenario: dashboard.ver but no crm.ver sees zeros, not an error

- **GIVEN** a viewer who holds `dashboard.ver` but NOT `crm.ver`
- **WHEN** the Pipeline face loads
- **THEN** every KPI tile shows zero and every chart shows its empty state
- **AND** no error is thrown (the aggregation view returns zero rows under RLS).

### Requirement: Oportunidades by estado (count) chart

The face SHALL render a horizontal bar chart of oportunidad **count per `estado`**, one bar
per estado catalog code present in visible data, ordered by the catalog `orden` (falling
back to descending count when order is unavailable). Because it is a single series, no
legend box is required (the title names it); the exact count SHALL be shown as a selective
direct label at each bar end.

#### Scenario: counts grouped by estado

- **GIVEN** visible oportunidades distributed across estados `abierta`, `ganada`, `perdida`
- **WHEN** the chart renders
- **THEN** there is exactly one bar per estado present in the data
- **AND** each bar's length encodes its count with a direct numeric label
- **AND** estados absent from visible data are omitted (no zero-length bars).

#### Scenario: empty pipeline

- **GIVEN** the viewer can see no oportunidades
- **WHEN** the chart renders
- **THEN** the chart region shows the Pipeline empty state (localized copy), not an empty
  axis.

### Requirement: Valor por estado (COP) chart

The face SHALL render a **second, separate** horizontal bar chart of summed
`valor_estimado_cop` per `estado` (COP). It MUST NOT be combined with the count chart on a
shared dual y-axis (the one-axis rule); the two measures are two charts.

#### Scenario: value chart is independent of the count chart

- **GIVEN** the count chart and the value chart are both shown
- **WHEN** the face renders
- **THEN** they are two distinct charts (or small multiples), never one chart with two
  y-scales
- **AND** the value chart's bars are labeled in COP.

### Requirement: Conversion metric with an explicit, confirmed classification

Conversion SHALL be computed only from an **owner-confirmed classification** of which
`estado_oportunidad` codes are *won* versus *lost* versus *open*. Until that classification
is confirmed, the conversion tile SHALL display a "pending classification" state rather than
a possibly-incorrect percentage. When confirmed, conversion = won / (won + lost).

#### Scenario: classification not yet confirmed

- **GIVEN** no won/lost estado classification has been confirmed (only `abierta` is seeded)
- **WHEN** the Pipeline face renders
- **THEN** the conversion tile shows the localized "pendiente de clasificación" state
- **AND** the count and value charts still render normally for whatever estado codes exist.

#### Scenario: classification confirmed

- **GIVEN** an owner-confirmed mapping marks `ganada` as won and `perdida` as lost
- **WHEN** the Pipeline face renders with visible won and lost oportunidades
- **THEN** the conversion tile shows `won / (won + lost)` as a percentage.

### Requirement: Servicios de interés distribution (optional secondary chart)

The face MAY render a horizontal bar of oportunidad count per `servicio_interes` code
(from `oportunidad_servicio`), top codes plus an "Otros" bucket, reading only rows the
viewer may see via the junction's RLS.

#### Scenario: servicios distribution respects junction RLS

- **GIVEN** visible oportunidades with attached servicios
- **WHEN** the servicios chart renders
- **THEN** counts are grouped by `servicio_codigo` over only visible rows
- **AND** a 9th-plus code folds into "Otros" rather than generating a new hue.

### Requirement: Loading and table-fallback affordances

Each chart and tile SHALL show a skeleton while its server data resolves, and the face SHALL
offer a table-view fallback of every charted series so identity/values are available without
relying on color.

#### Scenario: table fallback exposes the same numbers

- **GIVEN** the Pipeline face has rendered its charts
- **WHEN** the viewer opens the table view for a chart
- **THEN** the same estado/count and estado/value rows are shown as an accessible table.
