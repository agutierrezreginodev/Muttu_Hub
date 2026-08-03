# Demo Prep Checklist — Muttu Hub

Run this the morning of the demo, before you open the recording software.
Everything below is "if this is broken, the demo is broken" — there is no
graceful fallback for the client call.

## 0. Pre-flight (5 min)

- [ ] `git status` — you are on `main`, working tree clean
- [ ] `git log -1 --format="%H %s"` — last commit starts with `merge: feat/kanban-module-pr4b-board-render into main`
- [ ] Docker is running (`docker ps` shows at least one container)
- [ ] No other `next dev` running on port 3000 (`lsof -i:3000` empty)

## 1. Bring the stack up (10 min)

```bash
# 1. Start local Supabase (Postgres + Auth + Studio + Mailpit)
supabase start

# 2. Reset DB — applies all migrations + supabase/seed.sql
#    (Drops and re-creates everything. You LOSE all data.)
supabase db reset

# 3. Install deps if this is a fresh clone
pnpm install

# 4. Confirm .env.local has real Supabase keys
#    NEXT_PUBLIC_SUPABASE_URL should be http://127.0.0.1:54321
grep NEXT_PUBLIC_SUPABASE_URL .env.local
```

## 2. Provision your demo admin (3 min)

The seed loads the 4 roles but NO user. You need to create the first admin
yourself before anyone can log in.

```bash
# Get the service role key from the running stack
eval "$(supabase status -o env)"

# Invite the first admin
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  pnpm bootstrap:admin --email demo.admin@muttu.local --nombre "Admin Demo"
```

The script invites by email. The invite email lands in **Mailpit**
(http://127.0.0.1:54324) — Supabase's local mailer.

- [ ] Open http://127.0.0.1:54324
- [ ] Click the invite email
- [ ] Click the confirmation link
- [ ] Set a memorable password (e.g. `Demo2026!`)
- [ ] Log in at http://localhost:3000

**Save these credentials somewhere safe** — you will reuse them in the video
guide for your client.

## 2.5. Seed the demo data (1 min)

After the admin exists, run the demo seed. It populates the 10 catalogs
that the app needs to function, grants document categories to the 4 roles,
and inserts 3 clients, 5 contacts, 3 opportunities, 3 documents, 8 kanban
tasks, and 4 CRM-related tareas.

```bash
# Get the postgres container name
DB_CONTAINER=$(docker ps -qf name=supabase_db_)

# Apply the demo seed
docker exec -i "$DB_CONTAINER" \
  psql -U postgres -d postgres < supabase/seed_demo.sql
```

- [ ] The final SELECT shows: 3 clientes, 5 contactos, 3 oportunidades, 3 documentos, 13 tareas
- [ ] If you re-run it, no errors (it's idempotent by name)

## 3. Seed the demo data (15 min)

There is no `pnpm seed:demo` script. The app starts empty after
`bootstrap:admin`. You have to create records live. To save time and look
prepared, do this BEFORE you hit record, not during the recording.

### Recommended demo dataset

- **3 clientes** (one with full history, one in onboarding, one stale)
- **5 contactos** spread across the 3 clientes
- **3 oportunidades** in different stages (nueva, en curso, ganada)
- **2 compromisos** with different estados
- **2 tareas** (one completada, one pendiente)
- **2 categorías de documentos** ("Contratos" and "Onboarding")
- **3 documentos** in different categories and versions
- **6–10 tareas kanban** spread across "Pendiente", "En curso", "Hecho"

Tip: create everything as the admin. You can demo permission differences
later by inviting a second user with a non-admin role from the admin panel.

## 4. Pre-demo sanity (5 min)

```bash
# Run the test suite — must be 332/332 green
pnpm test

# Typecheck must be clean
pnpm typecheck

# Lint must be clean
pnpm lint
```

- [ ] Open http://localhost:3000 — log in
- [ ] Navigate CRM → pick a cliente → ficha opens
- [ ] Navigate Documentos on a cliente → tabla loads
- [ ] Navigate Kanban → tablero loads with your seeded tareas
- [ ] Open DevTools (F12) — no red errors in the console
- [ ] Network tab — no 4xx/5xx on a clean page load

## 5. Recording setup (10 min)

- [ ] Browser window at 1440×900 minimum
- [ ] Zoom browser to 100% (default)
- [ ] Close all other tabs
- [ ] Hide bookmarks bar
- [ ] Use a clean profile (or Incognito if you trust your login cookie)
- [ ] Disable browser notifications
- [ ] Set the OS to Do Not Disturb
- [ ] Recording tool of choice (OBS, Loom, QuickTime, etc.)
- [ ] Test mic level — record 10 seconds and play back

## 6. Things that WILL break the demo if you forget

| Symptom                                     | Cause                              | Fix                                       |
| ------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| Login fails with "Invalid credentials"      | Admin invite link not opened       | Re-open Mailpit, click the link           |
| Tablero Kanban empty                        | No kanban tareas seeded            | Create them as admin                      |
| "Could not find the Administrador role"     | `supabase db reset` not run        | Run it                                    |
| `pnpm dev` fails on port 3000               | Old `next dev` still running       | `lsof -i:3000` then `kill <pid>`          |
| Documentos upload returns 500               | Storage bucket not initialized     | `supabase db reset` reapplies storage     |
| Type errors on a page                       | Migration not applied              | `supabase db reset`                       |

## 7. After the demo

- [ ] Push any seed data commits if you want to keep them
- [ ] `git worktree prune` (4 orphaned agent worktrees)
- [ ] Decide whether to keep demo data or `supabase db reset` clean

## 8. What is NOT in this demo (be honest with the client)

These features are NOT in main yet — do not promise them in the call:

- **Create / edit / delete kanban cards** — the board is read-only
- **Drag & drop between kanban columns** — coming
- **User invitation UI polish** — the admin module invites by email; the
  flow works but is functional, not pretty
- **Dark mode** — design system has tokens; dark theme is not implemented
- **Mobile responsive kanban board** — desktop-first

If the client asks about any of these, the honest answer is "in the
roadmap, ETA next sprint" — not "we have it".
