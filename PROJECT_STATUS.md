# Project status — Muttu Hub

Working state and the next session's task list. Update it at the end of a
session, not at the start of the next one.

**Last updated:** 2026-08-05 · `main` at `a4111fe`

---

## 1. Open pull requests

Three standalone, plus one stacked kanban chain. **Merge the chain in order** —
each PR's base is the previous branch, so merging out of order replays the
parent's diff into the wrong place.

| PR                   | Base   | What                                                          | CI        |
| -------------------- | ------ | ------------------------------------------------------------- | --------- |
| [#31](../../pull/31) | `main` | `/recuperar` was gated: password recovery was unreachable     | ✅ 5/5    |
| [#32](../../pull/32) | `main` | demo seed stopped inventing its own kanban columns            | ✅ 5/5    |
| [#33](../../pull/33) | `main` | openspec bookkeeping: dashboard-4-caras 43/43                 | ✅ 5/5    |
| [#34](../../pull/34) | `main` | kanban 5a-i — `updateTareaAction`, `deleteTareaAction`        | ✅ 5/5    |
| [#35](../../pull/35) | #34    | kanban 5a-ii — create/edit/delete dialogs, wired to the board | ✅ 5/5    |
| [#36](../../pull/36) | #35    | kanban 5b — `moveTareaAction`, DnD, "Mover a…", scope toggle  | ✅ 5/5    |
| [#39](../../pull/39) | #36    | kanban 6-i — KV1 filters as server-side queries               | ✅ 5/5    |
| [#40](../../pull/40) | #39    | kanban 6-ii — the filter form                                 | ⏳ queued |
| [#41](../../pull/41) | #40    | kanban 6-iii — list view + view switch                        | ⏳ queued |
| [#38](../../pull/38) | #41    | kanban 7 — detail route + comment thread                      | ⏳ queued |

[#37](../../pull/37) was closed: 863 lines of code, over the repo's ~400 budget.
It is #39 → #40 → #41 now. The final tree is byte-identical to what #37 carried.

---

## 2. Where each module stands

| Module                                                  | State                                                 |
| ------------------------------------------------------- | ----------------------------------------------------- |
| platform-foundation, CRM, documentos, dashboard-4-caras | Shipped on `main`                                     |
| kanban-module                                           | Slices 1a–7 done (in review). Slices 8–13 not started |
| alertas-vencimiento (openspec)                          | SUPERSEDED — its scope lives in kanban slices 10–13   |

### Kanban slices still to build

Slices 8, 9 and 13 have no dependency on each other and can be taken in any
order. 10 needs the detail route (#38) merged; 11 and 12 are the email half.

| Slice   | What                                                                  | Depends on                    |
| ------- | --------------------------------------------------------------------- | ----------------------------- |
| 8       | On-screen reports — `reportes.ts` (pure), no export control (KR1/KR2) | #41 merged                    |
| 9       | CRM promote-to-board toggle (`'CRM' ⇄ 'Ambos'`)                       | #41 merged                    |
| 10      | `vencimiento.ts` + notification bell                                  | #38 merged (deep-link target) |
| 11a/11b | Daily digest Edge Function (Resend/Mailpit)                           | schema already shipped        |
| 12      | `pg_cron` / `pg_net` wiring for the digest                            | 11                            |
| 13      | Digest opt-out UI over `notificacion_preferencia`                     | nothing — independent         |

Slice 11 needs the toolchain edits design part 2 §11 calls for: `supabase/functions/**`
must leave `tsconfig.json`'s `include`, or `pnpm typecheck` fails on `Deno.serve`.

---

## 3. Next session — task list

| #   | Task                                                                            | Blocked by                           |
| --- | ------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Merge #31, #32, #33 (independent, all green)                                    | —                                    |
| 2   | Merge the kanban chain **in order**: #34 → #35 → #36 → #39 → #40 → #41 → #38    | CI on #40/#41/#38                    |
| 3   | Kanban slice 13 (digest opt-out UI) — the one slice with no dependency          | —                                    |
| 4   | Kanban slices 8 and 9                                                           | #41 merged                           |
| 5   | Kanban slice 10 (bell)                                                          | #38 merged                           |
| 6   | documentos-repositorio task 3.3 — the `[storage.buckets.documentos]` allow-list | **Owner decision** (open question 6) |
| 7   | Archive `dashboard-4-caras`; formally close `alertas-vencimiento`               | #33 merged                           |
| 8   | Check whether CI's `unit-tests` job is exposed to the vitest worker flake below | —                                    |

### Waiting on the owner

- **documentos 3.3** — whether `supabase/config.toml` should carry a
  `[storage.buckets.documentos]` allow-list. Deliberately deferred since the
  documentos module shipped; it is the only task in that change still open.

---

## 4. Environment gotchas

Each of these cost real time. They are here so they cost it once.

**`pnpm vitest run` silently drops test files.** At default concurrency this
machine hits `Failed to start threads worker`, and vitest then does not run
those files, does not report them as failed or skipped, and **still exits 0** —
a run can report "67 passed (67)" while 73 test files exist on disk.
`vitest list --filesOnly` collects all 73, so it is not a pattern problem.

```bash
pnpm vitest run --pool=threads --maxWorkers=2   # 73 files, 688 tests, no worker errors
```

Use that form for anything you are treating as a gate.

**E2E needs port 3000, hardcoded.** `e2e/env.ts` pins
`http://127.0.0.1:3000`, so a running `next dev` blocks the whole suite. To run
it while 3000 is busy, temporarily point `env.ts` at another port and use a
scratch Playwright config with the same port — and revert `env.ts` before
committing.

```bash
pnpm build                                     # e2e runs against a PRODUCTION build
eval "$(supabase status -o env)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" pnpm e2e
```

**A stale `.next` fails the build with a masked error.** `pnpm build` reports a
Server Components render error (`digest: '59304338'`, plus `Could not find files
for /_error in .next/build-manifest.json`) and the failing page moves as you
change unrelated things. `rm -rf .next` fixes it. Do not delete it while someone
has `next dev` running — that breaks their server.

**`pkill -f 'next start -p 3010'` kills its own Bash call**, because the command
line contains the pattern. Kill by PID from `ss -ltnp` instead.

**GitHub over a corporate network.** Some networks intercept TLS and both `git`
and `gh` fail with `certificate signer not trusted`. The legitimate fix is the
corporate root CA plus `http.sslCAInfo` — never `http.sslVerify=false`.

---

## 5. Testing rules this project learned the hard way

**Never assert on an optimistic UI and call it persistence.** The kanban board
moves a card immediately and calls the server afterwards. An assertion right
after the click passes locally (the round trip wins the race) and fails in CI
(the page closes with the server action in flight). Every persistence assertion
follows `await page.reload()`.

**Never chain E2E tests through shared state.** CI runs with `retries: 1`, and a
retry recomputes module-level values such as `Date.now()` titles — so a retried
test hunts for a fixture that run never created, and one real failure becomes
three confusing ones. Each test creates and deletes its own row.

**Accessible-name matching is substring by default.** `getByRole("link", { name:
"Tablero" })` also matches "Mi tablero". Use `exact: true` wherever labels nest.

**Tests ship with the code they cover.** When judging a PR against the ~400-line
budget, measure code and test lines separately — several kanban commits read as
over budget until you notice the majority is test.

---

## 6. Conventions worth knowing before opening a PR

- Conventional-commit titles; no `Co-Authored-By` trailers.
- PR bodies here are narrative and say **why**, with an honest "Plan de prueba"
  including the boxes that are _not_ checked. See #30 or any PR above.
- No issue-first workflow, no `type:*` labels: this repo has no PR template and
  no PR-validation workflow, and its merged PRs carry neither.
- ~400 changed lines per PR; split rather than exceed it.
- Every file under `supabase/migrations/` needs a matching pgTAP file under
  `supabase/tests/` — CI enforces it.
- A tab or link is never added before the route it points at exists.
