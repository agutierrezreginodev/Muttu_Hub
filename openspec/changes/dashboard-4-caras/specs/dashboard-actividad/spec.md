# Spec — Dashboard: Actividad Clientes face

Capability: `dashboard-actividad`
Change: `dashboard-4-caras`
Source: `bitacora_cliente`, `contacto`, `oportunidad`, `cliente`. **Kanban-independent.**

## ADDED Requirements

### Requirement: Actividad face is gated and RLS-scoped to visible clientes

The Actividad face SHALL render at `/dashboard/actividad` only after the `/dashboard` gate
confirms `dashboard.ver`, and every activity item SHALL come from the `security_invoker`
`v_actividad_cliente` UNION view, whose branches inherit each base table's RLS
(`bitacora_cliente_select`, `contacto_select`, `oportunidad_select` — all resolve through
`private.cliente_visible`, i.e. `crm.ver`).

#### Scenario: only activity on visible clientes is shown

- **GIVEN** a viewer holding `crm.ver`
- **WHEN** the Actividad face loads
- **THEN** every activity item belongs to a cliente the viewer may see; activity tied to a
  soft-deleted or invisible cliente does not appear.

#### Scenario: dashboard.ver but no crm.ver sees empty activity

- **GIVEN** a viewer holding `dashboard.ver` but not `crm.ver`
- **WHEN** the Actividad face loads
- **THEN** the recent-activity feed is empty, all counts are zero, and no error is thrown.

### Requirement: Unified recent-activity feed

The face SHALL present a chronological recent-activity **list** (not a chart) of the most
recent events within the configured window (default 30 days), each item carrying its type
(bitácora entry, nuevo contacto, nueva oportunidad, gestión de oportunidad), the cliente, the
actor, and the timestamp, newest first.

#### Scenario: feed merges the four event types newest-first

- **GIVEN** recent bitácora entries, new contactos, and new/updated oportunidades on visible clientes
- **WHEN** the feed renders
- **THEN** all four event types appear in one list ordered by occurrence time descending
- **AND** each item shows its type badge, cliente, actor, and relative timestamp.

### Requirement: Activity volume over time

The face SHALL render a line/area chart of total activity **events per week** over the window,
computed by grouping `v_actividad_cliente` by week.

#### Scenario: weekly activity volume

- **GIVEN** visible activity spread across several weeks
- **WHEN** the chart renders
- **THEN** each week bucket shows the total count of events (all types) in that week.

### Requirement: Most active clientes

The face SHALL render a horizontal bar chart of the **most active clientes** = event count
per `cliente_id` over the window (top N plus "Otros"), resolving cliente names via `v_cliente`.

#### Scenario: ranked by event count

- **GIVEN** visible activity concentrated on a few clientes
- **WHEN** the chart renders
- **THEN** the top N clientes by event count appear as labeled bars, ordered descending
- **AND** remaining clientes fold into "Otros".

### Requirement: New-this-period headlines

The face SHALL present stat tiles for **new contactos** and **new oportunidades** created
within the window, over visible clientes.

#### Scenario: new-count tiles

- **GIVEN** contactos and oportunidades created within the window on visible clientes
- **WHEN** the face loads
- **THEN** the "nuevos contactos" and "nuevas oportunidades" tiles show those counts.

### Requirement: Empty, loading, and table-fallback affordances

Each chart/tile/feed SHALL show a skeleton while loading, a localized empty state when there
is no visible activity, and a table-view fallback of every charted series.

#### Scenario: no visible activity

- **GIVEN** a viewer who sees no client activity in the window
- **WHEN** the Actividad face loads
- **THEN** the feed and charts show their empty states and tiles show zero, with no error.
