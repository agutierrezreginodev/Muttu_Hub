-- pgTAP for kanban slice 12 (20260806191419_daily_digest_cron.sql).
-- CI enforces a matching test file for every migration.

begin;
select plan(14);

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
select has_extension('pg_cron', 'pg_cron is installed');
select has_extension('pg_net', 'pg_net is installed');

-- pg_net lives in schema `net`, not `extensions`. Asserted because the call in
-- run_daily_digest() is schema-qualified against a search_path of '' — if a
-- future Supabase image relocated it, the function would break at runtime and
-- nowhere else.
select is(
  (select n.nspname::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post' limit 1),
  'net',
  'http_post lives in the net schema'
);

-- -----------------------------------------------------------------------------
-- The scheduled job
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from cron.job where jobname = 'daily-digest'),
  1,
  'exactly one daily-digest job is scheduled'
);

select is(
  (select schedule::text from cron.job where jobname = 'daily-digest'),
  '0 12 * * *',
  '12:00 UTC — 07:00 America/Bogota year-round, Colombia has no DST'
);

select is(
  (select command::text from cron.job where jobname = 'daily-digest'),
  'select private.run_daily_digest();',
  'the job calls the definer function and nothing else'
);

select is(
  (select active from cron.job where jobname = 'daily-digest'),
  true,
  'the job is active'
);

-- -----------------------------------------------------------------------------
-- The function's shape and privileges
-- -----------------------------------------------------------------------------
select has_function('private', 'run_daily_digest', 'private.run_daily_digest() exists');

select is(
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'run_daily_digest'),
  true,
  'run_daily_digest is security definer'
);

-- Postgres stores an empty search_path as the literal `search_path=""`, which
-- is how every other definer function in this schema records it.
select is(
  (select p.proconfig
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'run_daily_digest'),
  array['search_path=""'],
  'run_daily_digest pins an empty search_path'
);

-- The privilege assertions are the security core of this slice: the function
-- holds the service-role key in a local variable, so an EXECUTE grant would let
-- any logged-in user trigger a digest run — and, worse, is one step from being
-- a way to exercise a definer that talks to the network.
select ok(
  not has_function_privilege('authenticated', 'private.run_daily_digest()', 'EXECUTE'),
  'authenticated cannot execute run_daily_digest'
);
select ok(
  not has_function_privilege('anon', 'private.run_daily_digest()', 'EXECUTE'),
  'anon cannot execute run_daily_digest'
);
select ok(
  not has_function_privilege('public', 'private.run_daily_digest()', 'EXECUTE'),
  'public cannot execute run_daily_digest'
);

-- -----------------------------------------------------------------------------
-- Unprovisioned Vault: returns false and performs NO request.
--
-- Asserted by request-queue count invariance rather than by watching for an
-- actual send. A test that tried to observe a real HTTP call would either need
-- a live endpoint or would pass for the wrong reason when the network was
-- simply unreachable.
-- -----------------------------------------------------------------------------
select is(
  (
    with before as (select count(*) as n from net.http_request_queue),
         run    as (select private.run_daily_digest() as result),
         after  as (select count(*) as n from net.http_request_queue)
    select (select result from run)::text
        || ':'
        || ((select n from after) - (select n from before))::text
  ),
  'false:0',
  'with Vault unprovisioned it returns false and queues no request'
);

select * from finish();
rollback;
