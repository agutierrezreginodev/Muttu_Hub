# Spec — Dashboard: Tareas face

Capability: `dashboard-tareas`
Change: `dashboard-4-caras`
Source: `tarea` / `v_tarea`. **Kanban-dependent — do NOT apply until the Kanban tarea
contract is confirmed (see design.md §"Kanban Dependency — confirm before apply").**

## ADDED Requirements

### Requirement: Tareas face is gated and origen-aware

The Tareas face SHALL render at `/dashboard/tareas` only after the `/dashboard` gate
confirms `dashboard.ver`, and its aggregates SHALL be computed over `v_tarea`, whose
origen-aware RLS (`crm.ver` for `CRM` rows, `kanban.ver` for `Kanban` rows, either for
`Ambos`) determines which tareas the viewer counts.

#### Scenario: viewer with only crm.ver counts only CRM/Ambos tareas

- **GIVEN** a viewer holding `crm.ver` but not `kanban.ver`
- **WHEN** the Tareas face loads
- **THEN** all counts include `origen in ('CRM','Ambos')` tareas and exclude
  `origen = 'Kanban'` tareas (RLS filters them out of the aggregation view).

#### Scenario: viewer with only kanban.ver counts only Kanban/Ambos tareas

- **GIVEN** a viewer holding `kanban.ver` but not `crm.ver`
- **WHEN** the Tareas face loads
- **THEN** all counts include `origen in ('Kanban','Ambos')` tareas and exclude
  `origen = 'CRM'` tareas.

### Requirement: Status distribution by estado

The face SHALL render a horizontal bar chart of tarea **count per `estado`** across the five
states (`borrador,pendiente,en_curso,cumplido,cancelado`) present in visible data, with each
bar directly labeled. Estado values MUST be read from the data, not hardcoded, so a Kanban
change to the state set does not silently drop a bar.

#### Scenario: distribution grouped by estado

- **GIVEN** visible tareas across several estados
- **WHEN** the chart renders
- **THEN** there is one bar per estado present, each labeled with its count.

### Requirement: Overdue (vencidas) headline

The face SHALL present an **overdue** stat tile = count of visible tareas where the
`v_tarea.vencido` derived column is true (past `fecha_limite`, not in a terminal state),
using the reserved status palette (serious/critical) with an icon + label, never color alone.

#### Scenario: overdue reflects the derived vencido column

- **GIVEN** visible tareas some of which are past `fecha_limite` and non-terminal
- **WHEN** the face loads
- **THEN** the overdue tile equals the count where `v_tarea.vencido` is true
- **AND** it is never recomputed in app code (it reads the view's derived column).

### Requirement: Throughput over time

The face SHALL render a line/area chart of completed tareas over time (weekly buckets).
Because `tarea` has no completion timestamp today, throughput SHALL be computed as tareas
currently in estado `cumplido` bucketed by `updated_at`, and the chart SHALL be labeled as an
approximation until a Kanban completion timestamp is confirmed available.

#### Scenario: weekly completed throughput

- **GIVEN** visible tareas marked `cumplido` across several weeks (by `updated_at`)
- **WHEN** the throughput chart renders
- **THEN** each week bucket shows the count of `cumplido` tareas whose `updated_at` falls in
  that week
- **AND** the chart carries the "aproximado" label until the completion-timestamp dependency
  is resolved.

### Requirement: Open tareas by responsable

The face SHALL render a horizontal bar chart of **open** tareas (`estado in
('pendiente','en_curso')`) per `responsable_id`, resolving names via `v_usuario_activo`,
top N responsables plus an "Otros" bucket, with overdue tareas distinguishable per responsable.

#### Scenario: per-responsable open workload

- **GIVEN** visible open tareas assigned across several responsables
- **WHEN** the chart renders
- **THEN** there is one bar per responsable (top N), each labeled with the open count
- **AND** responsables beyond N fold into "Otros" rather than generating new hues.

### Requirement: Empty, loading, and table-fallback affordances

Each chart/tile SHALL show a skeleton while loading, a localized empty state when the viewer
sees no tareas, and a table-view fallback of every charted series.

#### Scenario: no visible tareas

- **GIVEN** a viewer who can see no tareas (lacks both `crm.ver` and `kanban.ver`)
- **WHEN** the Tareas face loads
- **THEN** every tile shows zero and every chart shows its empty state, with no error.
