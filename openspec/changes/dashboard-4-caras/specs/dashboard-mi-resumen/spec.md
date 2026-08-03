# Spec — Dashboard: Mi Resumen face

Capability: `dashboard-mi-resumen`
Change: `dashboard-4-caras`
Source: `tarea` / `v_tarea` (+ `cliente` / `v_cliente`). **Partially Kanban-dependent.**
The my-clients and CRM/Ambos-compromiso slices are Kanban-independent; the full-origen
"my tareas" counts (which include `origen = Kanban`) are Kanban-dependent — do NOT apply
that slice until the Kanban tarea contract is confirmed.

## ADDED Requirements

### Requirement: Mi Resumen is gated and self-scoped to the current user

The Mi Resumen face SHALL render at `/dashboard/mi-resumen` only after the `/dashboard` gate
confirms `dashboard.ver`, and every metric SHALL be scoped to the current user via
`auth.uid()` inside the `security_invoker` views (`responsable_id = auth.uid()` for tareas,
`responsable_interno_id = auth.uid()` for clientes) — so two different users never see each
other's rollup.

#### Scenario: rollup is per-user

- **GIVEN** users A and B each own different tareas and clientes
- **WHEN** A loads Mi Resumen
- **THEN** A's counts reflect only A's assigned tareas and A's clientes, never B's.

### Requirement: My open tareas and my compromisos headlines

The face SHALL present stat tiles for **my open tareas** (`responsable_id = auth.uid()` and
`estado in ('pendiente','en_curso')`) and **my compromisos** (the CRM slice:
`origen in ('CRM','Ambos')` assigned to me and non-terminal). The compromiso slice is
Kanban-independent; a full "my tareas across all origenes" count is the Kanban-dependent
extension.

#### Scenario: my open tareas tile

- **GIVEN** the current user is responsable of several tareas in mixed states
- **WHEN** Mi Resumen loads
- **THEN** the "mis tareas abiertas" tile counts only their `pendiente`/`en_curso` tareas.

#### Scenario: my compromisos tile (CRM slice, independent)

- **GIVEN** the current user has non-terminal `origen in ('CRM','Ambos')` tareas
- **WHEN** Mi Resumen loads
- **THEN** the "mis compromisos" tile counts them (this slice does not depend on Kanban).

### Requirement: My due-soon and overdue

The face SHALL present a **due-soon** tile (my non-terminal tareas with `fecha_limite` within
the configured horizon, default 7 days) and an **overdue** tile (my tareas where
`v_tarea.vencido` is true, using the reserved status palette with icon + label).

#### Scenario: due-soon horizon

- **GIVEN** the current user has non-terminal tareas due within 7 days and others due later
- **WHEN** Mi Resumen loads
- **THEN** the due-soon tile counts only those within the horizon.

#### Scenario: overdue uses the derived vencido column

- **GIVEN** the current user has tareas past `fecha_limite` and non-terminal
- **WHEN** Mi Resumen loads
- **THEN** the overdue tile equals the count where `v_tarea.vencido` is true, never recomputed.

### Requirement: My clients

The face SHALL present a **my clients** tile = count of clientes where
`responsable_interno_id = auth.uid()`, read from `v_cliente`. This slice is Kanban-independent.

#### Scenario: my clients count

- **GIVEN** the current user is the internal responsable of several non-deleted clientes
- **WHEN** Mi Resumen loads
- **THEN** the "mis clientes" tile counts them.

### Requirement: My agenda list and by-estado breakdown

The face SHALL present an **agenda** list of my next non-terminal tareas ordered by
`fecha_limite` ascending, and a small horizontal bar of my tareas by estado.

#### Scenario: agenda ordered by due date

- **GIVEN** the current user has several non-terminal tareas with due dates
- **WHEN** the agenda renders
- **THEN** items appear ordered by `fecha_limite` ascending, overdue items flagged.

### Requirement: Empty, loading, and table-fallback affordances

Each tile/list/chart SHALL show a skeleton while loading and a localized empty state when the
user has no assigned tareas/clientes.

#### Scenario: user with nothing assigned

- **GIVEN** a user who is responsable of no tareas and no clientes
- **WHEN** Mi Resumen loads
- **THEN** all tiles show zero and the agenda shows its empty state, with no error.
