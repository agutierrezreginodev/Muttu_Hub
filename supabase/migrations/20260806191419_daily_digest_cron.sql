-- Kanban module slice 12: schedule the daily digest (design part 3 §11-§12).
-- Source: sdd/kanban-module/tasks-part2 (Engram obs #185, slice 12),
-- design-part3 (obs #178), spec-part2 (obs #175, DG7/DG8).
--
-- Everything below was verified against a live instance before being written,
-- not assumed from documentation:
--   * pg_cron IS in shared_preload_libraries here, so `create extension`
--     succeeds and `cron.job` is reachable.
--   * pg_net installs into schema `net` — NOT `extensions`. The call below is
--     `net.http_post`, and its real signature is
--     (url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int).
--   * Secrets are read through `vault.decrypted_secrets`.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- 1. private.run_daily_digest() — the only thing cron calls.
--
-- Secrets come from Supabase Vault, NEVER from a database GUC. A GUC set with
-- ALTER DATABASE is readable by any logged-in role via current_setting(),
-- which would hand the service-role key — the key that bypasses RLS entirely —
-- to every `authenticated` user in the system. That is the whole reason this
-- reads Vault instead of the far simpler settings route.
--
-- With Vault unprovisioned the function returns false and issues NO request.
-- That is what makes a local `supabase db reset` inert: the cron.job row still
-- exists and stays assertable, while nothing is ever posted anywhere. The
-- alternative — scheduling conditionally on whether secrets happen to exist —
-- would make the schedule itself untestable and would silently skip the job in
-- production if provisioning ran late.
-- -----------------------------------------------------------------------------
create or replace function private.run_daily_digest()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'daily_digest_function_url';

  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'daily_digest_service_key';

  if v_url is null or v_key is null then
    -- Unprovisioned. Not an error: local and CI databases legitimately have
    -- no Vault entries, and raising here would fail every `db reset`.
    return false;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );

  return true;
end;
$$;

revoke all on function private.run_daily_digest() from public, anon, authenticated;
-- No grant to `authenticated`, deliberately and permanently. This function is
-- security definer and holds the service-role key in a local variable; an
-- EXECUTE grant would let any logged-in user trigger a full digest run at will.
-- Only the cron job (running as the table owner) calls it.

-- -----------------------------------------------------------------------------
-- 2. The schedule.
--
-- 07:00 America/Bogota = 12:00 UTC, year-round. Colombia has no DST, which is
-- the reason a fixed UTC cron expression is correct here and would NOT be in a
-- country that shifts. `DIGEST_HORA_BOGOTA` in
-- supabase/functions/_shared/vencimiento.ts records the same 07:00 on the
-- application side; the two must be changed together.
--
-- Scheduled UNCONDITIONALLY. cron.schedule() upserts by job name, so re-running
-- this migration re-points the existing job rather than duplicating it.
--
-- KILL SWITCH, for the release notes:
--     select cron.unschedule('daily-digest');
-- -----------------------------------------------------------------------------
select cron.schedule(
  'daily-digest',
  '0 12 * * *',
  $$select private.run_daily_digest();$$
);
