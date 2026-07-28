# Muttu Hub

Internal operations platform. Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4 + shadcn/ui + Supabase (Auth + Postgres). Postgres RLS is the only security boundary.

## Prerequisites

- Node.js 24+
- pnpm 11+
- Docker (for local Supabase: `supabase start`)

## Setup

```bash
cp .env.example .env.local   # fill in values from the Supabase dashboard
pnpm install
pnpm dev
```

## Scripts

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `pnpm dev`             | Start the dev server                          |
| `pnpm build`           | Production build                              |
| `pnpm lint`            | ESLint                                        |
| `pnpm format:check`    | Prettier check                                |
| `pnpm typecheck`       | Strict `tsc --noEmit`                         |
| `pnpm test`            | Vitest unit/component tests                   |
| `pnpm bootstrap:admin` | Provision the first Administrador (see below) |

## Database (Supabase)

```bash
supabase start        # local Postgres + Auth + Studio (requires Docker)
supabase db reset      # apply migrations + supabase/seed.sql from scratch
supabase test db        # run the pgTAP suite (supabase/tests/*.sql)
```

Every file under `supabase/migrations/` MUST have a matching pgTAP test file
under `supabase/tests/` (`scripts/check-migration-tests.sh`, enforced in CI) —
a migration without a test fails the build.

`supabase/seed.sql` loads only the 4 base roles (Administrador, Gerencia,
Coordinador, Colaborador). It never inserts into `auth.users` — seeding Auth
rows directly is fragile across Supabase versions. Instead, provision the
first Administrador with the bootstrap script once the stack is up and the
role seed has been applied:

```bash
SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
  pnpm bootstrap:admin --email admin@example.com --nombre "Admin Principal"
```

It uses the service-role Admin API to invite the user by email (the same
mechanism the admin module later uses for every other user) and is
idempotent: re-running it is a no-op once that email or an active
Administrador already exists.

## Conventions

- All user-facing copy lives in `src/messages/es.ts` (Spanish, Rioplatense-neutral).
- Environment variables: see `.env.example`. The service role key is server-only and must never be exposed as `NEXT_PUBLIC_`.
- Commits: Conventional Commits, one work unit per commit.

## Delivery

Built as stacked PR slices per SDD change `platform-foundation`:

1. PR 1 — Scaffold & hygiene
2. PR 2 — Database, RLS, seed, pgTAP
3. **PR 3 — Auth & session** (this branch)
4. PR 4 — Admin module
5. PR 5 — E2E & CI gates
