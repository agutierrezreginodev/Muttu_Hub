# Design — Alertas de vencimiento

Change slug: `alertas-vencimiento`
Reads: proposal.md (required), specs/notification-bell, specs/daily-digest-email

## 0. Constraints honored (from the established stack)

- Postgres RLS is the ONLY security boundary. Every new table RLS-enabled + FORCED;
  helper calls wrapped in `(select …)`; `security_invoker` views; soft-delete via
  definer RPC where applicable.
- Every `supabase/migrations/*.sql` file has a matching `supabase/tests/*.sql` pgTAP
  test (CI-enforced, RED before GREEN).
- All user copy in `src/messages/es.ts`. No hardcoded strings.
- UI: server-component fetch → client components; server actions do a permission
  pre-check → zod → write → `revalidatePath`; queries trust RLS.
- Tests: vitest + RTL (`*.test.tsx`), Playwright E2E (`e2e/`), pgTAP (DB).

## 1. Architecture decisions

### D1 — One canonical vencimiento model, expressed once in code

A single module `src/lib/notificaciones/vencimiento.ts` exports the window constant
and the classification, so the bell and the digest cannot drift.

```
VENTANA_VENCIMIENTO_MS = 72h              // due-soon horizon (3 days)
ESTADOS_ACTIVOS       = ['pendiente','en_curso']   // eligible states
// classify(fechaLimite, T):
//   vencido      = fechaLimite <  T
//   vence_pronto = T <= fechaLimite <= T + VENTANA
```

`vencido` intentionally equals `v_tarea.vencido`'s DB formula
(`fecha_limite is not null and fecha_limite < now() and estado not in
('cumplido','cancelado')`). The bell reads the DB's `vencido` column directly and
computes only `vence_pronto` in the query filter; the digest (running server-side)
uses the same TS constant. **Rationale:** the "overdue" truth already lives in the
DB view — reusing it avoids two definitions of "vencido".

### D2 — Scope = "mine" (`responsable_id = auth.uid()`), not "all-visible"

A Gerencia/Coordinador user can SELECT every cliente's tareas via `crm.ver`. Putting
all of them in a personal bell would be noise and would make the count meaningless.
Both surfaces scope to `responsable_id = <me>`. RLS still applies on top (a tarea
whose origen module the user lost is hidden), so scoping is "mine AND still
visible" — fail-closed. **Rejected:** an "all-visible" toggle — deferred; adds UI and
a second, larger query for no v1 need.

### D3 — Bell is LIVE per-request, NOT materialized ← key decision

- **Chosen:** a server-side query helper reads `v_tarea` on every request, filtered
  to `responsable_id = auth.uid()`, `estado in ('pendiente','en_curso')`, and
  `fecha_limite <= now() + 72h` (this single upper-bound predicate captures BOTH
  overdue and due-soon; the row's `vencido` column then partitions them). Ordered by
  `fecha_limite asc`.
- **Why live:** (a) the per-user dataset is tiny (one person's open tareas);
  (b) the read is index-backed by `tarea_vencidas_idx on (fecha_limite) where
deleted_at is null`; (c) freshness is a REQUIREMENT (SC1 — completing a task must
  drop it immediately); (d) it mirrors the existing live `getProximoCompromiso`
  read. Materializing (a counter column, a summary table, or a cron-refreshed view)
  would add write-amplification on every tarea mutation plus an invalidation surface,
  buying nothing at this scale.
- **Rejected:** materialized count table / `pg_cron`-refreshed matview / realtime
  push — all reintroduce staleness and invalidation for a query that is already cheap.

### D4 — Bell adds NO database object

The bell reuses `v_tarea` as-is. The due-soon horizon is applied as a query
predicate, not a stored column. **Rationale:** minimize the migration surface and
avoid coupling a UI-tuning constant (72h) into the schema. (If a future need arises
for a DB-side `vence_pronto`, it becomes a new `security_invoker` view then — not now.)

### D5 — Digest scheduling = pg_cron → pg_net → Edge Function ← key decision

- **Chosen pipeline:**
  1. `pg_cron` job `daily-digest` fires once/day at a fixed UTC hour equal to 07:00
     `America/Bogota`.
  2. The cron command uses `pg_net.http_post` to invoke the Supabase Edge Function
     `daily-digest` (authenticated with the service-role/function secret).
  3. The Deno Edge Function: reads candidate users, aggregates each user's items
     (service role, strictly `responsable_id`-scoped), checks opt-out + idempotency,
     renders the Spanish email, sends via the transactional transport, writes
     `digest_envio`.
- **Why:** pg_cron is the NATIVE Supabase scheduler — no external cron/CI needed.
  Postgres itself cannot cleanly speak SMTP, and the app's existing email path is
  **GoTrue auth-only** (`inviteUserByEmail`/`resetPasswordForEmail`) and cannot carry
  arbitrary digest content. An Edge Function keeps aggregation + rendering in
  TypeScript, which is unit-testable with vitest and consistent with the stack.
- **Rejected alternatives:**
  - _All-in-Postgres plpgsql job that sends email directly_ — no clean SMTP from PL/pgSQL; would need an unmanaged extension. Rejected.
  - _Next.js route + external cron (Vercel Cron / GitHub Actions)_ — adds an external
    scheduler and exposes a callable send endpoint that must be secured; pg_cron keeps
    the trigger inside the DB trust boundary. Rejected for v1.
  - _Bend GoTrue templates to send the digest_ — GoTrue only emits its fixed auth
    templates; not a general sender. Rejected.

### D6 — Idempotency via an append-only log with a unique day key

`digest_envio(usuario_id, fecha_envio)` carries `unique (usuario_id, fecha_envio)`.
The function inserts the log row and treats a unique-violation / `on conflict do
nothing` as "already sent today → skip". `fecha_envio` is computed as
`(now() at time zone 'America/Bogota')::date` so "one per day" is a Bogota calendar
day regardless of the UTC fire time. Append-only, mirroring `registro_acceso`:
no UPDATE/DELETE grant, no audit columns beyond `created_at`. **Ordering:** log-first
vs send-first is a real tradeoff — chosen **log-first (reserve the day), then send**;
a send failure after the reserved row is retried the next day (acceptable — a missed
digest is low-severity) and NEVER double-sends. (Alternative send-first risks a
double-send on a crash between send and log; rejected as worse.)

### D7 — Opt-out as a per-user preference row

`notificacion_preferencia(usuario_id pk, resumen_diario_email boolean not null
default true, updated_at)`. Absence of a row = opted-in (the default), so no backfill
is needed for existing users. Self-service write path: an authenticated user
upserts their OWN row (RLS `usuario_id = auth.uid()`). The digest job left-joins this
table and skips `resumen_diario_email = false`.

### D8 — No new permission module

`MODULOS` stays `crm/kanban/documentos/dashboard/admin`. Justification: the bell
reads only the caller's OWN tareas via `v_tarea` (already gated by origen-aware
`tarea_select`), and opt-out is a self-service own-row write — neither needs a new
`has_permission` axis. Adding a `notificaciones` module would create 5 unused
actions across every role's grid for zero enforcement gain. **This honors the "do
not invent a module lightly" rule.**

### D9 — service_role scoping is the security-critical invariant

The digest job bypasses RLS. The ONLY per-recipient query shape is `where
responsable_id = <that user>`. This is enforced structurally (a single parameterized
aggregation function/query, never a table-wide scan whose rows are then bucketed by
user in app code) and covered by a dedicated test (SC6). This also satisfies the org
data-minimization posture (each email carries only its recipient's own data).

### D10 — Extensible source contract

`VencimientoItem = { tipo: 'tarea' | …; id; titulo; fechaLimite; vencido;
vencePronto; href }`. v1 implements `tipo:'tarea'` only. `documento` expiry (gated
behind `documentos-repositorio`) and a possible `oportunidad`-staleness source can be
added as new `tipo`s without changing the bell/digest contract. `oportunidad` has NO
deadline column today (only `fecha_ultima_gestion`), so it is NOT a v1 source.

## 2. Vencimiento query/window model (concrete)

Bell query (server helper, RLS-trusted):

```
from v_tarea
select id, titulo, cliente_id, origen, fecha_limite, estado, vencido
where responsable_id = auth.uid()
  and estado in ('pendiente','en_curso')
  and fecha_limite is not null
  and fecha_limite <= now() + interval '72 hours'    -- overdue OR due-soon
order by fecha_limite asc
```

- `vencido` (from the view) partitions the result into overdue vs due-soon.
- No lower bound is needed: anything at or before `now()+72h` in an active state is
  either overdue (`vencido=true`) or due-soon (`vencido=false`).
- `responsable_id` is NOT a column of `v_tarea` today → see Kanban Dependency §6:
  the query needs `responsable_id` exposed by the view, or must read a view/base that
  exposes it. **This is a concrete dependency to confirm** (v_tarea currently selects
  `responsable_id` — verified in `20260728041925_audit.sql` — so it IS available).

Digest aggregation (Edge Function, service role, per user `u`):

```
same predicate, but responsable_id = u.id, evaluated at the job's T
```

## 3. Data-model sketch (DESIGN proposal — NOT a migration)

> These DDL sketches are illustrative; the actual migration is written in the apply
> phase with the repo's exact grant/REVOKE + FORCE conventions.

```
-- notificacion_preferencia: per-user opt-out (self-service own-row).
create table public.notificacion_preferencia (
  usuario_id uuid primary key references public.usuario(id),
  resumen_diario_email boolean not null default true,
  updated_at timestamptz not null default now()
);
-- RLS enabled + FORCED. authenticated: select/insert/update WHERE usuario_id = auth.uid().
-- No DELETE. security_invoker view v_notificacion_preferencia (own row).

-- digest_envio: append-only idempotency + audit log (registro_acceso pattern).
create table public.digest_envio (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuario(id),
  fecha_envio date not null,          -- America/Bogota calendar day
  item_count integer not null,        -- items included when sent
  created_at timestamptz not null default now(),
  unique (usuario_id, fecha_envio)
);
-- RLS enabled + FORCED. authenticated: NO insert/update/delete.
-- SELECT gated (own row OR admin.ver). service_role writes it (bypasses RLS).
```

Preference upsert path: a thin definer RPC `set_resumen_diario_email(p_enabled
boolean)` that writes the caller's own row (`auth.uid()`), OR a plain RLS-gated
upsert from the server action — chosen: **plain RLS-gated upsert** (own-row policy is
sufficient; no elevated privilege needed), matching how `updateUserAction` uses the
regular client.

## 4. Bell — app architecture

- `src/lib/notificaciones/vencimiento.ts` — constants + `classify()` (pure, tested).
- `src/lib/notificaciones/queries.ts` — `getVencimientos()` / `countVencimientos()`
  over `v_tarea` (RLS-trusted; empty on denial, never throws — the codebase list
  convention).
- `src/components/notificaciones/notification-bell.tsx` — client toggle + badge
  (accessible, mirrors `UserMenu`'s disclosure pattern; the shadcn kit has no
  dropdown-menu primitive, so build the disclosure on `Button`, same as `UserMenu`).
- `src/components/notificaciones/notification-list.tsx` — the dropdown list +
  deep-link builder (`hrefFor(item)`): CRM → `/crm/{cliente_id}`; Kanban → its target.
- Wiring: `app-shell.tsx` renders the bell; the count is fetched in the server
  component that renders the shell and passed down (server fetch → client render).

## 5. Digest — Edge Function architecture

`supabase/functions/daily-digest/`:

- `index.ts` — HTTP handler: authorize the call (function secret), orchestrate.
- `aggregate.ts` — per-user item aggregation (service-role query, `responsable_id`
  scoped). Pure-where-possible so vitest can test the classification/partition.
- `render.ts` — pure ES subject/body renderer from `(user, items)` → `{subject, html,
text}`. Fully unit-testable (no I/O).
- `send.ts` — transport adapter (SMTP/provider). The only impure edge; kept thin.
- Idempotency + opt-out live in `index.ts` around `aggregate`/`send`.

Cron wiring migration (SQL): enable `pg_cron` + `pg_net`; `cron.schedule('daily-
digest', '<utc-cron>', $$ select net.http_post(url := …, headers := …) $$);`. The
function URL + auth header come from DB settings/secrets (never hardcoded).

## 6. Migration Plan + pgTAP test names

| #   | Migration (proposed filename)           | Contents                                                                                                                                                        | Matching pgTAP test                                      |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| M1  | `*_notificacion_preferencia_digest.sql` | `notificacion_preferencia` + `digest_envio` tables, RLS enable+FORCE, grants/REVOKEs, own-row policies, append-only policies, `v_notificacion_preferencia` view | `supabase/tests/notificacion_preferencia_digest_rls.sql` |
| M2  | `*_daily_digest_cron.sql`               | enable `pg_cron`/`pg_net`; `cron.schedule('daily-digest', …)`; grants for the invocation                                                                        | `supabase/tests/daily_digest_cron.sql`                   |

pgTAP coverage for M1 (RED first): RLS is enabled+forced on both tables; a user can
select/insert/update only their OWN `notificacion_preferencia` row and NOT another's;
`digest_envio` has no INSERT/UPDATE/DELETE grant for `authenticated`; the
`unique(usuario_id, fecha_envio)` constraint exists and rejects a duplicate day;
default `resumen_diario_email = true`; `v_notificacion_preferencia` is
`security_invoker`.

pgTAP coverage for M2: the `daily-digest` cron job row exists in `cron.job` with the
expected schedule; `pg_cron`/`pg_net` extensions are installed. (Send behavior itself
is proven by vitest on the pure helpers + Playwright/Mailpit E2E, not pgTAP.)

## 7. Test Plan

- **pgTAP:** M1 + M2 as above (DB security + schedule existence).
- **vitest (pure):** `vencimiento.classify()` (overdue/due-soon/boundary/terminal/
  draft/null); digest `aggregate` partition equals the bell partition for a fixture;
  `render()` ES output contains both counts, all items, opt-out reference; the
  deep-link builder (`hrefFor`).
- **RTL (`*.test.tsx`):** bell renders count from props; badge hidden at zero;
  dropdown lists items ordered by fecha_limite; empty state; accessible toggle.
- **Playwright E2E (`e2e/`):**
  - bell shows the caller's overdue count and updates after completing a task (SC1);
  - user A does not see user B's items (SC3);
  - digest delivery: run the function for an opted-in user with due items → assert a
    message in **Mailpit** (reuse `e2e/utils/mailpit.ts`); opted-out user → none (SC5);
    re-run same day → no second message (SC4); no-content user → none.
- **Scoping/security:** a test that the service-role aggregation for user A returns
  ONLY user A's rows (SC6).

## 8. Kanban Dependency — confirm before apply

**READ TWICE.** A separate agent is actively building **Kanban**, which OWNS the
shared `tarea` engine (`public.tarea`, `public.v_tarea`, `tarea_select` RLS). This
feature is a heavy READER. The tarea contract below is taken from
`supabase/migrations/20260728041924_domain.sql` and `…041925_audit.sql` as they exist
TODAY. Before applying any tarea-dependent slice (PR1 bell, PR3 digest aggregation),
each row MUST be re-validated against Kanban's FINAL contract:

| Depended-on surface (today)                                                              | How this feature uses it                                                                        | Must re-confirm if Kanban changes…                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tarea.fecha_limite timestamptz`                                                         | window pivot for overdue/due-soon                                                               | its name/type, or introduces a separate "start"/"due" split                        |
| `tarea.estado` values `borrador,pendiente,en_curso,cumplido,cancelado`                   | active = `pendiente,en_curso`; terminal = `cumplido,cancelado`; `borrador` excluded             | adds/removes/renames a state or re-partitions active vs terminal                   |
| `tarea.responsable_id uuid`                                                              | THE "mine" scope for bell + digest                                                              | ownership model (e.g. multiple assignees, a join table)                            |
| `tarea.cliente_id`, `tarea.origen (CRM/Kanban/Ambos)`, `tarea.titulo`                    | deep-link target + label; origen decides link destination                                       | origen value set, or link targets                                                  |
| `tarea.deleted_at` soft-delete                                                           | excluded everywhere (via `v_tarea`)                                                             | the soft-delete convention                                                         |
| index `tarea_vencidas_idx on (fecha_limite) where deleted_at is null`                    | backs the window scan                                                                           | it is dropped/renamed (perf regression, not correctness)                           |
| view `public.v_tarea` incl. derived `vencido` and the `responsable_id` column it exposes | bell/digest read this view directly; rely on `vencido` and on `responsable_id` being selectable | `v_tarea`'s column list (esp. dropping `responsable_id`), or the `vencido` formula |
| policy `tarea_select` (origen-aware)                                                     | the bell trusts RLS for "still visible"                                                         | the visibility predicate                                                           |

**Concrete pre-apply checklist (owner/Kanban sign-off):**

1. Does `v_tarea` still expose `responsable_id` and `vencido`? (Today: YES.)
2. Are `pendiente`/`en_curso` still the correct "active, actionable" states, and
   `cumplido`/`cancelado` still the only terminal ones?
3. Did Kanban introduce a NEW state that should count as due (e.g. `bloqueado`)?
4. Did Kanban add its own view/materialization that SUPERSEDES `v_tarea` as the read
   surface? If so, repoint the bell/digest at it.
5. Are the Kanban deep-link routes finalized so `hrefFor(origen='Kanban')` is correct?

If any answer diverges, update `vencimiento.ts` (states/window), the query, and
`hrefFor` BEFORE apply. Non-tarea slices (M1 schema, PR4 preferences UI) are NOT
gated by this.

## 9. Open questions (for the owner)

- **OQ1 — Email provider.** Resend (simple HTTPS from Deno) vs. reusing the
  configured auth SMTP for transactional sends. Recommendation: Resend for
  cleanliness; the transport adapter (`send.ts`) isolates the choice.
- **OQ2 — Fire time.** 07:00 America/Bogota assumed. Confirm.
- **OQ3 — Due-soon window.** 72h assumed. Confirm (single constant, trivial to tune).
- **OQ4 — digest_envio read audience.** Own-row only, or also `admin.ver`? Assumed
  own-row + admin.ver.
- **OQ5 — Bell "all-visible" mode.** Deferred (mine-only in v1). Confirm acceptable.
