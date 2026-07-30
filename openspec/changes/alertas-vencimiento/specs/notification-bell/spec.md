# Spec — notification-bell

Capability: `notification-bell`
Change: `alertas-vencimiento`

The header **campana**: a live, per-request indicator of the signed-in user's own
overdue / due-soon `tarea` rows, with a dropdown listing them and deep links.

## ADDED Requirements

### Requirement: Canonical vencimiento model
The system SHALL derive vencimiento state from a single canonical model reused by
both the bell and the daily digest, so the two never disagree. For a `tarea`, the
model MUST use `estado in ('pendiente','en_curso')` and `deleted_at is null`, and
classify by `fecha_limite` relative to the evaluation instant `T`:
- `vencido` (overdue): `fecha_limite < T` (identical to `v_tarea.vencido`).
- `vence_pronto` (due soon): `T <= fecha_limite <= T + VENTANA_VENCIMIENTO`, where
  `VENTANA_VENCIMIENTO = 72 hours (3 days)` is a single named constant.
Rows with `fecha_limite is null`, terminal estados (`cumplido`, `cancelado`), or
`estado = 'borrador'` MUST NOT be classified as vencido or vence_pronto.

#### Scenario: Overdue classification matches v_tarea.vencido
- GIVEN a `tarea` with `estado = 'pendiente'`, `deleted_at is null`, and `fecha_limite` one day in the past
- WHEN the vencimiento model evaluates it at `T = now()`
- THEN it is classified `vencido = true` and `vence_pronto = false`

#### Scenario: Due-soon within the 72h window
- GIVEN a `tarea` with `estado = 'en_curso'` and `fecha_limite` 48 hours in the future
- WHEN the model evaluates it at `T = now()`
- THEN it is classified `vence_pronto = true` and `vencido = false`

#### Scenario: Outside the window is neither
- GIVEN a `tarea` with `fecha_limite` 10 days in the future
- WHEN the model evaluates it
- THEN it is classified `vencido = false` and `vence_pronto = false` (not surfaced)

#### Scenario: Terminal and draft states are excluded
- GIVEN a past-due `tarea` whose `estado` is `cumplido`, `cancelado`, or `borrador`
- WHEN the model evaluates it
- THEN it is NOT surfaced as vencido or vence_pronto

### Requirement: Personal scoping ("mine")
The bell SHALL surface ONLY tareas where `responsable_id = auth.uid()`. It MUST NOT
surface tareas belonging to other users, even when the caller may SELECT them via a
broad `crm.ver` / `kanban.ver` grant.

#### Scenario: Only my tareas appear
- GIVEN user A is `responsable_id` of an overdue tarea, and user B is `responsable_id` of a different overdue tarea on the same visible cliente
- WHEN user A opens the bell
- THEN user A sees their own item and NOT user B's item

#### Scenario: Visibility still constrained by RLS
- GIVEN a tarea assigned to the caller whose `origen` module the caller lost permission for
- WHEN the bell query runs (reading `v_tarea`, which is `security_invoker`)
- THEN the row is excluded by `tarea_select` RLS and does not appear (fail-closed)

### Requirement: Live count, not materialized
The bell count and list SHALL be computed live per request from `v_tarea`; the
system MUST NOT store or cache a materialized notification count. A change to the
underlying tareas MUST be reflected on the next load with no separate invalidation
step.

#### Scenario: Completing a task updates the count live
- GIVEN the bell shows a count of 3 for the caller
- WHEN one of those tareas transitions to `cumplido`
- THEN the next bell load shows a count of 2, with no cache-busting action required

### Requirement: Bell count and dropdown contents
The bell SHALL display the total number of the caller's `vencido` + `vence_pronto`
items. Opening it SHALL show a dropdown listing those items ordered by `fecha_limite`
ascending (most overdue first), each rendering its `titulo`, a relative due
indicator, and a visual distinction between `vencido` and `vence_pronto`. Copy MUST
come from `src/messages/es.ts` (no hardcoded strings).

#### Scenario: Count reflects both buckets
- GIVEN the caller has 2 vencido and 1 vence_pronto own tareas
- WHEN the bell renders
- THEN it shows a count of 3

#### Scenario: Ordered most-overdue first
- GIVEN the caller has several due items with different `fecha_limite`
- WHEN the dropdown opens
- THEN items are listed by `fecha_limite` ascending

#### Scenario: Empty state
- GIVEN the caller has zero vencido and zero vence_pronto own tareas
- WHEN the bell renders
- THEN it shows no numeric badge and the dropdown shows the empty-state copy

### Requirement: Deep links
Each dropdown item SHALL link to the item's context: a CRM-origen (`origen in
('CRM','Ambos')`) tarea with a `cliente_id` links to that cliente's ficha; a
Kanban-origen tarea links to its Kanban target. A tarea with no navigable context
MUST still render (label only) without a broken link.

#### Scenario: CRM item links to the ficha
- GIVEN an overdue `origen = 'CRM'` tarea tied to `cliente_id = 42`
- WHEN the caller clicks it in the dropdown
- THEN they navigate to that cliente's ficha

#### Scenario: Kanban item links to its target
- GIVEN an overdue `origen = 'Kanban'` tarea
- WHEN the caller clicks it
- THEN they navigate to the Kanban target for that tarea

### Requirement: Extensible source model
The bell's item contract SHALL be source-tagged (`tipo`) so future sources
(documents, opportunities) can be added without changing the bell's rendering
contract. v1 SHALL implement exactly one source: `tarea`.

#### Scenario: v1 renders only tarea items
- GIVEN the only implemented source is `tarea`
- WHEN the bell renders
- THEN every item has `tipo = 'tarea'`, and the contract admits additional `tipo`s without a breaking change

### Requirement: Accessibility and shell integration
The bell SHALL mount in the authenticated app header (`app-shell.tsx`) for every
signed-in user, expose an accessible toggle (`aria-haspopup`, `aria-expanded`) and a
labelled count, and follow the existing header control sizing/pattern (as with
`UserMenu`).

#### Scenario: Present for every authenticated user
- GIVEN any signed-in user (regardless of module permissions)
- WHEN the app shell renders
- THEN the bell is present in the header

#### Scenario: Keyboard and screen-reader accessible
- GIVEN a keyboard/screen-reader user
- WHEN they reach the bell toggle
- THEN it announces its purpose and current count and toggles the dropdown via keyboard
