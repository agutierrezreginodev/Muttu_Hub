# Spec — daily-digest-email

Capability: `daily-digest-email`
Change: `alertas-vencimiento`

A once-daily email per user summarizing their overdue / due-soon items, produced by
a scheduled job, honoring opt-out and idempotency, using the same canonical
vencimiento model as the bell.

## ADDED Requirements

### Requirement: Once-daily scheduled trigger

The system SHALL trigger the digest exactly once per day via a Supabase pg_cron
schedule that invokes the `daily-digest` Edge Function. The schedule MUST fire at a
fixed local morning time defined in `America/Bogota` (implemented as the equivalent
fixed UTC hour, since pg_cron runs in UTC).

#### Scenario: Scheduled once per day

- GIVEN the digest cron job is installed
- WHEN a full day elapses
- THEN the `daily-digest` function is invoked exactly once

#### Scenario: Kill switch

- GIVEN operations `cron.unschedule('daily-digest')`
- WHEN the day's fire time arrives
- THEN no digest is sent, and no data is mutated

### Requirement: Per-user aggregation with strict scoping

For each candidate user, the digest SHALL aggregate ONLY that user's own items,
scoped by `responsable_id = <that user's id>`, using the canonical vencimiento model
(`vencido` + `vence_pronto`, `estado in ('pendiente','en_curso')`, `deleted_at is
null`, window = 72h). Because the job runs with elevated privilege (service_role,
which bypasses RLS), per-user `responsable_id` scoping MUST be the ONLY query shape;
the job MUST NOT emit any other user's rows to a recipient.

#### Scenario: Recipient sees only their own items

- GIVEN user A and user B each have overdue tareas on the same cliente
- WHEN the digest for user A is built
- THEN it contains only user A's items and none of user B's

#### Scenario: Same model as the bell

- GIVEN a set of the user's tareas
- WHEN the digest classifies them
- THEN the vencido/vence_pronto partition is identical to what the bell would show for that user at the same instant

### Requirement: Opt-out

The system SHALL maintain a per-user preference `notificacion_preferencia.
resumen_diario_email` (boolean, default `true`; absence of a row = default). The
digest MUST skip any user whose effective value is `false`.

#### Scenario: Opted-out user gets nothing

- GIVEN user A has `resumen_diario_email = false`
- WHEN the digest job runs
- THEN user A receives no email and no `digest_envio` row is written for user A that day

#### Scenario: Default is opted-in

- GIVEN user B has no `notificacion_preferencia` row
- WHEN the digest job runs and user B has due items
- THEN user B receives the digest (treated as opted-in)

#### Scenario: Self-service toggle

- GIVEN a signed-in user on the preferences surface
- WHEN they toggle "resumen diario por email" off and save
- THEN their own `notificacion_preferencia` row reflects `false` (own-row only; they cannot change another user's preference)

### Requirement: Idempotency (no double-send)

The system SHALL record each sent digest in an append-only `digest_envio` log keyed
`unique (usuario_id, fecha_envio)`, where `fecha_envio` is the `America/Bogota`
calendar date. A second run for the same user on the same calendar day MUST NOT send
a second email.

#### Scenario: Re-running the job the same day sends nothing new

- GIVEN user A already received today's digest (a `digest_envio` row exists for `(A, today_bogota)`)
- WHEN the digest job runs again the same Bogota day
- THEN user A receives no additional email (insert conflicts / is skipped)

#### Scenario: Next day sends again

- GIVEN user A received yesterday's digest
- WHEN the job runs the next Bogota day and user A still has due items
- THEN user A receives a new digest and a new `digest_envio` row is written

### Requirement: No-content suppression

The digest SHALL NOT send an email to a user who has zero vencido and zero
vence_pronto items at run time (no "nothing due" emails).

#### Scenario: User with nothing due is skipped

- GIVEN user C is opted-in but has no overdue and no due-soon tareas
- WHEN the job runs
- THEN user C receives no email

### Requirement: Spanish email template

The email SHALL be rendered in Spanish, with a subject and body that summarize the
counts and list the items (título + due indicator), visually separating vencidos
from próximos a vencer, and MUST include a link back into the app and a reference to
how to opt out. User-facing strings MUST be centralized (mirroring the `es.ts`
convention), not scattered literals.

#### Scenario: Body reflects the user's buckets

- GIVEN user A has 2 vencidos and 1 próximo a vencer
- WHEN the email is rendered
- THEN it states both counts and lists all 3 items in Spanish

#### Scenario: Opt-out reference present

- GIVEN any rendered digest
- WHEN the recipient reads it
- THEN it references how to stop receiving the daily digest

### Requirement: Reuse the environment email transport; secrets protected

The digest SHALL send through the environment's configured transactional transport
(SMTP/provider), reusing the same delivery infrastructure the invite/recovery flow
relies on where possible. Any provider credential MUST be supplied as an Edge
Function secret and MUST NOT be exposed to the browser (never `NEXT_PUBLIC_`).

#### Scenario: Local E2E delivery via Mailpit

- GIVEN the local Supabase email-testing server (Mailpit)
- WHEN the digest job runs for an opted-in user with due items
- THEN a digest email addressed to that user appears in Mailpit (same round-trip the invite E2E uses)

#### Scenario: No secret leakage

- GIVEN the deployed function
- WHEN its configuration is inspected
- THEN the provider/service-role keys are Edge-Function secrets, absent from any `NEXT_PUBLIC_` variable or client bundle

### Requirement: RLS on new tables

`notificacion_preferencia` and `digest_envio` SHALL have RLS enabled AND forced.
`notificacion_preferencia`: an authenticated user MAY select/insert/update only their
OWN row (`usuario_id = auth.uid()`), never another user's. `digest_envio` is
append-only from the job (service_role): authenticated users get no INSERT/UPDATE/
DELETE; reads are restricted (own row and/or `admin.ver`), matching the codebase's
append-only pattern (`registro_acceso`).

#### Scenario: User cannot edit another user's preference

- GIVEN authenticated user A
- WHEN A attempts to update user B's `notificacion_preferencia` row
- THEN the write is denied by RLS (own-row check fails)

#### Scenario: digest_envio is not writable by authenticated

- GIVEN authenticated user A
- WHEN A attempts to INSERT/UPDATE/DELETE `digest_envio`
- THEN the operation is denied (no grant / no policy); only the service-role job writes it
