> **⚠️ SUPERSEDED — 2026-07-30.** This change is superseded by the `kanban-module`
> SDD change (Engram-tracked), which absorbs BOTH capabilities (`notification-bell`,
> `daily-digest-email`) so that Kanban and the alerting engine settle the shared
> `tarea` contract in one change instead of coordinating across two. The Kanban
> dependency gate this document describes in §"Kanban Dependency — confirm before
> apply" is therefore dissolved, not scheduled.
>
> **Authoritative plan:** Engram `topic_key: sdd/kanban-module/proposal` (+ part 2 at
> `sdd/kanban-module/proposal-delivery`), project `muttu_hub`.
>
> This file and its `design.md` / `specs/` / `tasks.md` are retained UNCHANGED as
> source material — `sdd-spec` reuses the two spec files' scenarios rather than
> re-deriving them. Do not plan or apply work from this change directly.

# Proposal — Alertas de vencimiento

Change slug: `alertas-vencimiento`
Status: DRAFT (planning only — no code, no migrations)
Author: SDD planning agent

## Intent

Give every Muttu Hub user timely, personal visibility of work that is **overdue**
or **due soon**, through two surfaces:

1. **Campana (notification bell)** in the app header — a live count of the user's
   own vencidas / próximas-a-vencer `tarea` rows, with a dropdown that lists them
   and links to the relevant CRM ficha (or later, Kanban card).
2. **Resumen diario por email** — a once-a-day digest per user summarizing the same
   overdue / due-soon items, sent by a scheduled job, with idempotency and opt-out.

Both surfaces read the SAME "vencimiento model" so the number in the bell and the
list in the email never disagree.

## Scope — In

- A **live, per-request** bell that reads the user's own tareas from `v_tarea`,
  partitioned into `vencido` (overdue) and `vence_pronto` (due within the window),
  scoped to `responsable_id = auth.uid()`. No new table for the bell.
- A **single, canonical vencimiento model** (windows + scoping + estado filter)
  shared by the bell query helper and the digest aggregation.
- A **daily digest email** per user, scheduled with **Supabase pg_cron → pg_net →
  an Edge Function**, that: aggregates each user's overdue/due-soon items, honors
  a per-user **opt-out**, is **idempotent** (never double-sends the same calendar
  day), renders a Spanish template, and logs each send.
- Two small new tables: `notificacion_preferencia` (opt-out) and `digest_envio`
  (append-only idempotency/audit log) — both RLS-enabled + FORCED, with matching
  pgTAP tests.
- A minimal **opt-out preferences surface** in the app (toggle "resumen diario").
- All copy in `src/messages/es.ts`.

## Scope — Out (explicitly)

- **Oportunidad vencimientos.** `public.oportunidad` has **no deadline column**
  (only `fecha_ultima_gestion date`, a "last managed" marker — not a due date).
  There is nothing to be "overdue" against. A future "oportunidad estancada"
  alert (stale `fecha_ultima_gestion`) is a DIFFERENT signal and is out of scope.
- **Document expiry (vencimiento de documentos).** Depends on the separate
  `documentos-repositorio` feature. Designed as a **pluggable optional source**
  behind that feature; NOT implemented here and NOT a hard dependency.
- **In-app "read/unread" persistence, per-notification dismissal, snooze,
  websockets/realtime push.** The bell is a live derived view, not an inbox.
- **Configurable per-user thresholds / per-module digest routing.** The window is
  a single named constant in v1.
- **Any new permission module.** See "Approach → Permissions".

## Capabilities

- `notification-bell` — the header campana + dropdown (live).
- `daily-digest-email` — the scheduled per-user email digest.

(Delta specs live under `specs/<capability>/spec.md`.)

## Approach (summary — full rationale in `design.md`)

- **Vencimiento model (canonical).** For a `tarea` with `estado in ('pendiente','en_curso')`
  and `deleted_at is null`:
  - `vencido` (overdue): `fecha_limite < now()` — reuses `v_tarea.vencido`'s exact
    formula (`fecha_limite is not null and fecha_limite < now() and estado not in ('cumplido','cancelado')`).
  - `vence_pronto` (due soon): `now() <= fecha_limite <= now() + VENTANA` where
    `VENTANA = 72h (3 días)` — a single named constant.
  - **Scope = "mine"**: `responsable_id = auth.uid()`. Personal accountability, not
    "everything I'm allowed to see" (a Gerencia user sees every cliente's tareas via
    RLS — surfacing all of them in a personal bell would be noise).
- **Bell = live per-request query, NOT materialized.** The dataset per user is tiny
  (their own open tareas), the read is index-backed (`tarea_vencidas_idx`), and the
  data MUST be fresh (completing a task must drop it from the bell immediately).
  Materializing would add staleness + invalidation cost for no benefit. This mirrors
  the existing `getProximoCompromiso` live read over `v_tarea`.
- **Digest scheduling = pg_cron + pg_net + Edge Function.** pg_cron is the native
  Supabase scheduler (one `cron.schedule` row, no external cron). It POSTs (via
  `pg_net.http_post`) to a Deno Edge Function `daily-digest` that does the
  aggregation, opt-out check, idempotency check, ES rendering, send, and logging.
  Rationale: Postgres cannot cleanly send SMTP; the app's existing email path is
  **GoTrue auth-only** (invite/recovery) and cannot carry arbitrary digest content;
  keeping render/aggregation in TypeScript makes it unit-testable with vitest.
- **Idempotency.** `digest_envio` has `unique (usuario_id, fecha_envio)` (calendar
  day in America/Bogota). The function inserts the log row FIRST (or `on conflict do
  nothing`); a duplicate day is a no-op.
- **Opt-out.** `notificacion_preferencia(usuario_id pk, resumen_diario_email bool
  default true)`. The digest skips users whose flag is false. Absence of a row = the
  default (opted in).
- **Permissions.** **No new module.** The bell reads only the caller's own tareas
  through `v_tarea` (already gated by the origen-aware `tarea_select` RLS). Opt-out
  is self-service on the user's own preference row. `MODULOS`
  (`crm/kanban/documentos/dashboard/admin`) is unchanged.
- **Email mechanism reuse.** The digest reuses the environment's SMTP/provider
  config, but because GoTrue only sends auth templates, the Edge Function sends via
  a transactional provider (Resend or the configured SMTP) using an Edge-Function
  secret — never a `NEXT_PUBLIC_` key. E2E asserts delivery through the same local
  Mailpit server the invite flow already uses.

## Affected areas

- `src/messages/es.ts` — new `notificaciones` / `digest` copy sections.
- `src/components/shell/app-shell.tsx` — mount the bell in the header nav.
- New: `src/components/notificaciones/*` (bell + dropdown client components).
- New: `src/lib/notificaciones/queries.ts` (vencimiento query helper) + the shared
  window/scope constants and `VencimientoItem` type.
- New: `src/lib/notificaciones/preferencias/actions.ts` (opt-out server action).
- New: `supabase/migrations/*_notificacion_preferencia_digest.sql` + pgTAP under
  `supabase/tests/`.
- New: `supabase/migrations/*_daily_digest_cron.sql` (pg_cron/pg_net wiring) + pgTAP.
- New: `supabase/functions/daily-digest/` (Edge Function + pure render/aggregate
  helpers unit-tested by vitest).
- New: preferences surface page/route + `e2e/` coverage.

## Risks

- **R1 — Kanban owns the `tarea` engine (see dedicated section below).** The bell
  and digest read `tarea`/`v_tarea` heavily; a concurrent Kanban change to estados,
  columns, `v_tarea`, or the vencido formula would silently change what counts as
  "vencido". Mitigated by the confirm-before-apply gate.
- **R2 — service_role bypasses RLS.** The digest job runs privileged and MUST scope
  strictly to `responsable_id = <that user>`; a scoping bug would email one user
  another's data. Mitigated by making per-user scoping the ONLY query shape and
  covering it with tests.
- **R3 — New infra (pg_cron, pg_net, Edge Functions, email provider).** First use in
  this repo. Mitigated by isolating it to the digest PR and keeping the bell (PR1)
  free of any new infra.
- **R4 — Timezone drift.** pg_cron runs in UTC; "one email per day" must be a
  Bogota calendar day. Mitigated by computing `fecha_envio` in `America/Bogota`.
- **R5 — Email provider secret handling.** Must live in Edge-Function secrets, never
  in `NEXT_PUBLIC_`. Mitigated by the bootstrap script convention already in the repo.

## Rollback

- **Bell (PR1):** app-only; revert the component + query + shell wiring. No DB state.
- **Digest schema (PR2):** the two tables are additive; a down-path drops
  `digest_envio` and `notificacion_preferencia` (no other table references them).
- **Cron/Edge (PR3):** `cron.unschedule('daily-digest')` disables sending instantly
  without touching data; the Edge Function can be left deployed but idle.
- **Preferences UI (PR4):** app-only revert.
Each slice is independently revertible; disabling the cron is the fastest kill-switch.

## Dependencies

- **Existing DB contract (today):** `public.tarea` + `public.v_tarea` (incl. the
  `vencido` derived column and origen-aware `tarea_select` RLS), `public.usuario`,
  `private.has_permission`. All present on `main`.
- **New Postgres extensions:** `pg_cron`, `pg_net` (Supabase-provided).
- **New runtime:** Supabase Edge Functions (`[edge_runtime] enabled = true` already).
- **Email provider:** an SMTP/HTTP transactional provider reachable from the Edge
  Function (OPEN QUESTION — Resend vs. the configured auth SMTP).
- **Optional / future source:** `documentos-repositorio` (document expiry) — pluggable,
  not required.

## Kanban Dependency — confirm before apply

A separate agent is actively building **Kanban**, which **OWNS** the shared `tarea`
engine. This feature is a heavy READER of that engine. Before applying any
tarea-dependent slice (PR1 bell, PR3 digest aggregation), the following must be
re-validated against Kanban's FINAL `tarea` contract:

| Depended-on surface (as of `20260728041924_domain.sql`) | Why we depend on it | Re-validate if Kanban… |
|---|---|---|
| `tarea.fecha_limite timestamptz` | the vencimiento window pivot | renames/retypes it, or adds a second date |
| `tarea.estado in ('borrador','pendiente','en_curso','cumplido','cancelado')` | filter = active `('pendiente','en_curso')`; terminal = `('cumplido','cancelado')` | adds/removes/renames a state, or changes which states are "terminal" |
| `tarea.responsable_id uuid` | the "mine" scope for both surfaces | changes ownership semantics (e.g. multi-assignee) |
| `tarea.cliente_id`, `tarea.origen`, `tarea.titulo` | deep-link target + label | changes origen values or link targets |
| `tarea.deleted_at` (soft delete) | excluded from every read | changes the soft-delete convention |
| index `tarea_vencidas_idx on (fecha_limite) where deleted_at is null` | backs the window scan | drops/renames it |
| view `public.v_tarea` + its `vencido` expression | the bell/digest read it directly | changes `v_tarea`'s columns, drops it, or edits the `vencido` formula |
| policy `tarea_select` (origen-aware) | the bell trusts RLS for visibility | changes the visibility predicate |

**Gate:** the tasks file marks every tarea-dependent task `BLOCKED until Kanban tarea
contract confirmed`. Non-tarea slices (PR2 schema, PR4 UI) are NOT blocked.

## Success Criteria

- SC1 — A user with 2 overdue + 1 due-soon own tareas sees a bell count of **3**;
  completing one drops the count to **2** on next load (live, no stale cache).
- SC2 — The bell dropdown links each item to its cliente ficha (CRM origen) or
  Kanban target, and shows an empty state when there is nothing due.
- SC3 — The bell shows ONLY the caller's own tareas (`responsable_id = auth.uid()`),
  proven by a test where user A cannot see user B's due items.
- SC4 — The digest job emails each opted-in user exactly ONE message per Bogota
  calendar day listing their overdue/due-soon items; re-running the job the same day
  sends nothing (idempotent).
- SC5 — A user with `resumen_diario_email = false` receives NO digest.
- SC6 — The digest email contains ONLY that recipient's own items (no cross-user
  leakage), proven under service_role.
- SC7 — Every new migration has a matching pgTAP test; vitest/RTL cover the bell,
  the query helper, the render/aggregate helpers, and the opt-out action; Playwright
  covers bell-count and (Mailpit) digest delivery.
- SC8 — `MODULOS` in `src/lib/permissions/schema.ts` is unchanged (no new module).
