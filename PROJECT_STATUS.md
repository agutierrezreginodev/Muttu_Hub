# Project status — Muttu Hub

Working state and the next session's task list. Update it at the end of a
session, not at the start of the next one.

**Last updated:** 2026-08-06 · `main` at `a4111fe` · every module below is
BUILT; nothing new is pushed, because GitHub is still unreachable.

---

## 1. Where each module stands

| Module                  | State                                                       |
| ----------------------- | ----------------------------------------------------------- |
| platform-foundation     | Shipped on `main`                                            |
| CRM                     | Shipped on `main` — no open openspec change, `crm-flow` E2E green |
| documentos-repositorio  | 34/35 tasks. One open, and it needs YOU — see §4             |
| dashboard-4-caras       | 43/43 once PR #33 merges; the code has been on `main` for a while |
| **kanban-module**       | **13/13 slices COMPLETE.** Slices 1a–7 in PRs #34–#41; 8–13 local |
| alertas-vencimiento     | **CLOSED** — superseded, and the work that replaced it is done |

`alertas-vencimiento` was never executed as its own change: kanban slices 10,
11a, 11b, 12 and 13 absorbed both of its capabilities. Its proposal now carries
a closure table mapping each capability to the commit that delivered it.

---

## 2. Open pull requests

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

[#37](../../pull/37) was closed: 863 lines, over the repo's ~400 budget. It is
#39 → #40 → #41 now, byte-identical in its final tree.

---

## 3. Local branches with no remote

Built on 2026-08-06. **These have never been pushed** — `gh` and `git` cannot
reach GitHub through the corporate TLS interception. They are ready to push the
moment the network allows it.

Stacked on the tip of #38 (`feat/kanban-module-pr7-detalle-comentarios`):

| Branch                              | Commit    | Slice                                    |
| ----------------------------------- | --------- | ---------------------------------------- |
| `feat/kanban-module-pr8-reportes`   | `fa9dd4d` | 8 — on-screen reports (KR1/KR2)          |
| `feat/kanban-module-pr9-promote`    | `a438bab` | 9 — promote a CRM compromiso to the board |
| `feat/kanban-module-pr10-campana`   | `541753a` | 10 — due-date model + notification bell  |
| `feat/kanban-module-pr11a-digest-core` | `b368283` | 11a + 11b — daily digest Edge Function |
| `feat/kanban-module-pr12-cron`      | `100c3b5` | 12 — pg_cron schedule, grants, E2E fixes |

Independent, off `main`:

| Branch                                        | Commit    | Slice                     |
| --------------------------------------------- | --------- | ------------------------- |
| `feat/kanban-module-pr13-preferencias-digest` | `be31d9c` | 13 — digest opt-out page  |

**Note on the 11a/11b commit:** it exceeds the ~400-line budget deliberately.
`index.ts` and `send.ts` are mutually dependent, so the planned split would
produce an intermediate commit that does not typecheck. Flagged in its message
as a `size:exception` for the reviewer.

### Verification, as of 2026-08-06 against the full stack

| Gate           | Result                              |
| -------------- | ----------------------------------- |
| `pnpm typecheck` | 0                                 |
| `pnpm lint`      | 0 errors (5 warnings, 2 pre-existing) |
| `pnpm vitest`    | 86 files / 799 tests               |
| `supabase test db` | **577/577 across 25 files**      |
| `pnpm build`     | 0                                  |
| `pnpm e2e`       | **41/41**                          |

Plus a live run of the deployed digest: it sent a real email to Mailpit,
refused to send a second the same Bogota day, and recorded `item_count: 2`
from three seeded tareas — the past-due `borrador` correctly excluded.

---

## 4. Waiting on the owner

- **documentos task 3.3** — whether `supabase/config.toml` should carry a
  `[storage.buckets.documentos]` allow-list. Deliberately deferred since the
  documentos module shipped; the only task in that change still open.
- **The uncommitted `src/lib/supabase/middleware.ts`** in the working tree is
  the same fix as PR #31. It will conflict once #31 merges. Decide before then.

---

## 5. Next session — task list

| #   | Task                                                                       | Blocked by       |
| --- | -------------------------------------------------------------------------- | ---------------- |
| 1   | Push the six local branches                                                | Network          |
| 2   | Merge #31, #32, #33 (independent, all green)                               | —                |
| 3   | Merge the chain in order: #34 → #35 → #36 → #39 → #40 → #41 → #38          | CI on #40/#41/#38 |
| 4   | Open PRs for slices 8 → 9 → 10 → 11a/b → 12, stacked in that order         | Task 3           |
| 5   | Archive `dashboard-4-caras`; `alertas-vencimiento` is already closed       | #33 merged       |
| 6   | Release notes from design §16 (8 items, listed below)                      | —                |
| 7   | Ops prerequisites before UAT (below)                                       | Owner            |
| 8   | Check whether CI's `unit-tests` job is exposed to the vitest worker flake  | —                |

### Release notes still to write (design §16)

The bell is not an inbox · attachments deferred · the terminal-column alerting
tradeoff · the log-first cost · the board vs report field split · etiqueta
deactivation semantics · personal-only alerts · unbounded terminal columns.
Plus the digest kill switch: `select cron.unschedule('daily-digest');`

### Ops prerequisites before UAT

Grant a role `kanban.*` via `/admin/roles` · Resend account + domain
verification + `supabase secrets set` · provision the two Vault secrets
(`daily_digest_function_url`, `daily_digest_service_key`) in production ·
`supabase functions deploy daily-digest`.

### One thing that is NOT verified

`ci.yml`'s e2e job sets `MAILPIT_BASE_URL=http://host.docker.internal:54324`.
That works on Docker Desktop/WSL and was tested there. It is **untested on a
Linux runner**, which may not provide that host. If the digest E2E fails in CI
with a connection error, that is the value to change first.

### And one thing that could not be created

`.env.example` — the README references it twice and `.gitignore` negates it,
but writing it is blocked by this environment's guard on environment files. It
still needs to exist. Its contents should document, with placeholder values
only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL`, `DIGEST_FROM_EMAIL`,
`DIGEST_TRANSPORT`, `MAILPIT_BASE_URL`, `RESEND_API_KEY`.

---

## 6. Environment gotchas

Each of these cost real time. They are here so they cost it once.

**Local demo data and the E2E suite cannot share a database.**
`supabase/seed_demo.sql` grants the Administrador, Gerencia and Coordinador
roles document categories, and inserts documentos. `config.toml` runs only
`seed.sql` on reset, so CI never sees it — but a local database carrying it
fails three `documentos.spec.ts` tests, for reasons that look like product
bugs and are not. `supabase db reset` restores the clean state; re-apply
`seed_demo.sql` when you need to demo.

**`pnpm vitest run` silently drops test files.** At default concurrency this
machine hits `Failed to start threads worker`, and vitest then does not run
those files, does not report them as failed or skipped, and **still exits 0**.
Always cross-check the collected file count against disk.

```bash
pnpm vitest run --pool=threads --maxWorkers=2
```

**A stale `.next` breaks things two different ways.** `pnpm build` reports a
masked Server Components error, and — after switching branches —
`.next/types/validator.ts` still references routes from the other branch, so
`tsc --noEmit` fails on a file nobody wrote. `rm -rf .next` fixes both. Do not
delete it while someone has `next dev` running.

**E2E needs port 3000, hardcoded**, and runs against a PRODUCTION build.

```bash
pnpm build
eval "$(supabase status -o env)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" pnpm e2e
```

**The digest E2E needs the stack started with its variables exported**, because
`[edge_runtime.secrets]`'s `env(...)` references resolve at `supabase start`:

```bash
export APP_BASE_URL=http://127.0.0.1:3000 \
       DIGEST_FROM_EMAIL=no-reply@muttu-hub.test \
       DIGEST_TRANSPORT=mailpit \
       MAILPIT_BASE_URL=http://host.docker.internal:54324
supabase stop && supabase start
```

**`pkill -f 'next start -p 3010'` kills its own Bash call.** Kill by PID.

**GitHub over a corporate network.** Some networks intercept TLS and both
`git` and `gh` fail with `certificate signer not trusted`. The legitimate fix
is the corporate root CA plus `http.sslCAInfo` — never `http.sslVerify=false`.

---

## 7. Testing rules this project learned the hard way

**Never assert on an optimistic UI and call it persistence.** Every persistence
assertion follows `await page.reload()`.

**Never chain E2E tests through shared state.** CI runs with `retries: 1`, and
a retry recomputes module-level values such as `Date.now()` titles. Each test
creates and deletes its own rows.

**Accessible-name matching is substring by default**, and a title can render
twice on one page (a ficha shows the próximo-compromiso badge AND the table
row). Scope the locator or use `exact: true`.

**Never ignore the `error` from a Supabase write.** This cost real time three
separate times in one session: the daily digest reported `200 {"enviados":0}`
for days-worth of runs while both its reads were refused; an E2E seeded zero
tareas and blamed the digest; and an opted-out user got mailed because the
preference insert had silently failed. `{ data }` alone hides everything.

**`service_role` has BYPASSRLS, which does NOT skip table-privilege checks.**
Row visibility and table privilege are separate gates. Anything the service
role reads needs an explicit `grant select`.

**Read the existing helpers before writing an E2E spec.** All five specs added
on 2026-08-06 failed their first full run, every one of them a test defect —
wrong button label, a flow that does not navigate, an unscoped locator.

**Tests ship with the code they cover.** When judging a PR against the ~400-line
budget, measure code and test lines separately.

---

## 8. Conventions worth knowing before opening a PR

- Conventional-commit titles; no `Co-Authored-By` trailers.
- PR bodies here are narrative and say **why**, with an honest "Plan de prueba"
  including the boxes that are _not_ checked.
- No issue-first workflow, no `type:*` labels.
- ~400 changed lines per PR; split rather than exceed it, and if a split would
  produce a commit that does not build, say so instead of faking it.
- Every file under `supabase/migrations/` needs a matching pgTAP file under
  `supabase/tests/` — CI enforces it.
- A tab or link is never added before the route it points at exists.
- Verify against the running system, not the schema. The digest's missing
  grants were invisible in the DDL and obvious the moment the function was
  invoked.
