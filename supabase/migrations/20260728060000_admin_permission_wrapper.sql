-- Public wrapper for private.has_permission(). Needed for Phase 4 (admin
-- module): task 4.2 gates /admin via "has_permission('admin','ver') — call
-- the DB function, don't reimplement permission logic in TypeScript".
--
-- private.has_permission() itself is intentionally NOT in an exposed schema
-- (design decision "has_permission()": "Supabase rule: no definer fns in
-- exposed schemas; avoids RLS recursion" — sdd/platform-foundation/design,
-- Engram obs #137), and supabase/config.toml only exposes `public` and
-- `graphql_public` via PostgREST. That means the Next.js app cannot call
-- private.has_permission() directly through supabase-js's .rpc() — the
-- design's own RLS policies call it fine because policies execute inside
-- Postgres, not through the PostgREST schema-exposure boundary.
--
-- This mirrors the exact public-wrapper-over-private-definer-fn pattern
-- 0003_audit.sql already established for the soft_delete_* RPCs: a thin
-- SECURITY INVOKER function in `public` that only forwards to the private
-- implementation, so the real permission logic still lives in one place
-- and this wrapper carries no additional privilege of its own.

create or replace function public.has_permission(modulo text, accion text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_permission(modulo, accion);
$$;

revoke all on function public.has_permission(text, text) from public, anon;
grant execute on function public.has_permission(text, text) to authenticated;
