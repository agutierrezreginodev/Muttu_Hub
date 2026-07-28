# Muttu Hub

Internal operations platform. Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4 + shadcn/ui + Supabase (Auth + Postgres). Postgres RLS is the only security boundary.

## Prerequisites

- Node.js 24+
- pnpm 11+
- Docker (for local Supabase, lands in a later slice)

## Setup

```bash
cp .env.example .env.local   # fill in values from the Supabase dashboard
pnpm install
pnpm dev
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm format:check` | Prettier check |
| `pnpm typecheck` | Strict `tsc --noEmit` |

## Conventions

- All user-facing copy lives in `src/messages/es.ts` (Spanish, Rioplatense-neutral).
- Environment variables: see `.env.example`. The service role key is server-only and must never be exposed as `NEXT_PUBLIC_`.
- Commits: Conventional Commits, one work unit per commit.

## Delivery

Built as stacked PR slices per SDD change `platform-foundation`:

1. **PR 1 — Scaffold & hygiene** (this branch)
2. PR 2 — Database, RLS, seed, pgTAP
3. PR 3 — Auth & session
4. PR 4 — Admin module
5. PR 5 — E2E & CI gates
