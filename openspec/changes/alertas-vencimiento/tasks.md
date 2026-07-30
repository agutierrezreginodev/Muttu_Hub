# Tasks — Alertas de vencimiento

Change slug: `alertas-vencimiento`
Reads: spec (both capabilities) + design.md (required)

Conventions: strict TDD (RED before GREEN). Each migration lands WITH its pgTAP test
(CI-enforced pairing). Work units are sized as stacked-PR slices (≤ ~400 changed
lines each). Checkboxes are checked by `sdd-apply` as work completes.

Legend: 🔴 = write failing test first · 🟢 = make it pass · 🚧 = **BLOCKED until
Kanban tarea contract confirmed** (see design §8).

---

## PR1 — Notification bell (app-only, live over `v_tarea`)  🚧 tarea-dependent

No migration. Reads existing `v_tarea`. Depends on the tarea contract (confirm §8).

- [ ] 1.0 🚧 **Confirm Kanban tarea contract** (design §8 checklist): `v_tarea`
      exposes `responsable_id` + `vencido`; active states = `pendiente,en_curso`;
      terminal = `cumplido,cancelado`; Kanban deep-link routes final. Do NOT start
      1.1+ until confirmed.
- [ ] 1.1 Add `notificaciones` copy to `src/messages/es.ts` (bell label, count aria,
      vencido/próximo labels, empty state, "ver ficha"/"ver en Kanban").
- [ ] 1.2 🔴 vitest for `src/lib/notificaciones/vencimiento.ts` — `classify()` cases:
      overdue, due-soon, boundary (exactly `T` and `T+72h`), outside window, terminal
      (`cumplido`/`cancelado`), `borrador`, `fecha_limite null`.
- [ ] 1.3 🟢 Implement `vencimiento.ts` — `VENTANA_VENCIMIENTO_MS`, `ESTADOS_ACTIVOS`,
      `classify()`, `VencimientoItem` type (source-tagged, design D10).
- [ ] 1.4 🔴 vitest for `src/lib/notificaciones/queries.ts` — `getVencimientos()` /
      `countVencimientos()` shape: `responsable_id = me` filter, `estado in active`,
      `fecha_limite <= now()+72h`, order asc, maps rows → `VencimientoItem`, returns
      `[]`/`0` on empty (RLS-denied) result (mock the supabase client, mirror
      `crm/queries.test.ts`).
- [ ] 1.5 🟢 Implement `queries.ts` over `v_tarea` (live; no cache; empty-on-denial).
- [ ] 1.6 🔴 vitest for `hrefFor(item)` — CRM→`/crm/{cliente_id}`, Kanban→target,
      no-context→no link.
- [ ] 1.7 🟢 Implement `hrefFor`.
- [ ] 1.8 🔴 RTL `notification-bell.test.tsx` + `notification-list.test.tsx` — count
      badge from props, badge hidden at 0, list ordered, empty state, accessible
      toggle (`aria-haspopup`/`aria-expanded`).
- [ ] 1.9 🟢 Implement `notification-bell.tsx` + `notification-list.tsx` (disclosure
      on `Button`, like `UserMenu`).
- [ ] 1.10 🟢 Wire the bell into `app-shell.tsx` (server fetch of the count in the
      shell's server component → pass to the client bell). Present for every user.
- [ ] 1.11 🔴🟢 Playwright `e2e/notification-bell.spec.ts` — SC1 (count + drops after
      completing a task) and SC3 (A cannot see B's items).

## PR2 — Digest schema (tables + RLS + pgTAP)  ✅ NOT tarea-dependent

- [ ] 2.1 🔴 Write `supabase/tests/notificacion_preferencia_digest_rls.sql` (pgTAP,
      FAILS first): RLS enabled+forced on both tables; own-row select/insert/update
      on `notificacion_preferencia` + denial of another user's row; `digest_envio`
      has no INSERT/UPDATE/DELETE grant for `authenticated`; `unique(usuario_id,
      fecha_envio)` rejects a duplicate day; `resumen_diario_email` default `true`;
      `v_notificacion_preferencia` is `security_invoker`.
- [ ] 2.2 🟢 Write `supabase/migrations/*_notificacion_preferencia_digest.sql`:
      both tables (design §3), RLS enable+FORCE, revoke-all-then-regrant matrix,
      own-row policies, append-only policies, `v_notificacion_preferencia` view.
      Make 2.1 GREEN.
- [ ] 2.3 Update `src/lib/permissions/schema.ts`? → **NO CHANGE** (design D8). Add a
      one-line comment/test note asserting `MODULOS` is intentionally unchanged (SC8).

## PR3 — Digest aggregation + Edge Function + cron  🚧 tarea-dependent (aggregation)

Largest slice — split into 3a (function/logic) and 3b (schedule wiring) to stay
within budget.

### PR3a — Edge Function + pure logic
- [ ] 3a.0 🚧 Re-confirm §8 (aggregation reads the same tarea contract as the bell).
- [ ] 3a.1 Add `digest` copy to a centralized ES strings module for the function
      (subject, section headings vencidos/próximos, opt-out line, app link label).
- [ ] 3a.2 🔴 vitest `supabase/functions/daily-digest/aggregate.test.ts` — per-user
      partition equals the bell partition for a shared fixture; strictly
      `responsable_id`-scoped (SC6: user A aggregation excludes B's rows).
- [ ] 3a.3 🟢 Implement `aggregate.ts` (service-role query, `responsable_id = u.id`,
      canonical model reused from `vencimiento.ts`).
- [ ] 3a.4 🔴 vitest `render.test.ts` — ES output states both counts, lists all
      items, includes opt-out reference + app link; no-item input → suppressed.
- [ ] 3a.5 🟢 Implement `render.ts` (pure) + thin `send.ts` transport adapter.
- [ ] 3a.6 🟢 Implement `index.ts` — authorize (function secret); for each candidate
      user: opt-out check → aggregate → skip if empty (no-content suppression) →
      **log-first** insert into `digest_envio` `on conflict do nothing` (idempotency,
      design D6) → send → done.

### PR3b — Schedule wiring
- [ ] 3b.1 🔴 Write `supabase/tests/daily_digest_cron.sql` (pgTAP, FAILS first):
      `pg_cron`/`pg_net` installed; a `cron.job` row named `daily-digest` exists with
      the expected UTC schedule.
- [ ] 3b.2 🟢 Write `supabase/migrations/*_daily_digest_cron.sql`: enable extensions;
      `cron.schedule('daily-digest', '<utc≈07:00 Bogota>', $$ select net.http_post(…) $$)`;
      pull function URL/secret from DB settings (never hardcoded). Make 3b.1 GREEN.
- [ ] 3b.3 🔴🟢 Playwright `e2e/daily-digest.spec.ts` (Mailpit): opted-in + due →
      email arrives (SC4/local delivery); opted-out → none (SC5); re-run same day →
      no second email (SC4 idempotency); no-content user → none.

## PR4 — Opt-out preferences UI  ✅ NOT tarea-dependent

- [ ] 4.1 Add preferences copy to `src/messages/es.ts` (screen title, "resumen diario
      por email", on/off, save success).
- [ ] 4.2 🔴 vitest for `src/lib/notificaciones/preferencias/actions.ts` — zod parse,
      own-row upsert of `resumen_diario_email`, `revalidatePath`; returns friendly
      error on failure (mirror `admin/actions` shape).
- [ ] 4.3 🟢 Implement the server action (regular RLS-gated client; own-row upsert —
      no elevated privilege, design D7).
- [ ] 4.4 🔴 RTL for the preferences client component (toggle reflects current value,
      calls the action, shows save toast).
- [ ] 4.5 🟢 Implement the preferences page/route + client component; reachable from
      the app (e.g. a "Preferencias" item in `UserMenu`).
- [ ] 4.6 🔴🟢 Playwright `e2e/notificacion-preferencias.spec.ts` — toggle off,
      reload, value persists (own-row).

---

## Dependency order

```
PR2 (schema) ─┐
              ├─> PR3a (function reads schema + tarea) ─> PR3b (cron) ─> PR3 E2E
PR1 (bell) ───┘         ▲                                   
PR4 (opt-out UI) ── depends on PR2 (preferencia table)     
```
- PR1 and PR2 are independent and can land in either order.
- PR3a depends on PR2 (writes `digest_envio`, reads `notificacion_preferencia`) and
  on the tarea contract.
- PR4 depends on PR2 (`notificacion_preferencia`).

## Review Workload Forecast

| Slice | Est. changed lines | Risk | Notes |
|---|---|---|---|
| PR1 bell | ~330 | Med | app + tests; 🚧 tarea-dependent; no DB |
| PR2 schema | ~300 | Med | migration + pgTAP; new tables; RLS-critical |
| PR3a fn+logic | ~380 | **High** | new runtime (Edge/Deno), service_role scoping, email render/send; 🚧 |
| PR3b cron | ~180 | Med | pg_cron/pg_net first use; small SQL + E2E |
| PR4 opt-out UI | ~240 | Low | standard action+UI pattern |

- **Chained PRs recommended: YES.** Five stacked slices; PR3 is split (3a/3b) to keep
  each under the ~400-line budget.
- **400-line budget risk: Medium** — PR3a is the closest to the ceiling; if it
  exceeds, split `send.ts`/transport into its own follow-up slice.
- **Decision needed before apply: YES** — resolve the Kanban §8 checklist (blocks PR1,
  PR3a) and OQ1 email provider (blocks PR3a `send.ts`) with the owner first.
- Each slice is one reviewable work-unit; commit test-with-code (Conventional
  Commits), pgTAP paired with its migration in the same commit.
