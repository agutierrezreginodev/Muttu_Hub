-- pgTAP: notificacion_preferencia + digest_envio migration (kanban-module
-- slice 3, §9) -- the notification engine's DB layer. Independent of the
-- tarea-dependent chain (parallel branch, per tasks obs #179).
-- Source: sdd/kanban-module/design-part2 (Engram obs #177 §9, correction C7),
-- spec-part2 (obs #175, DG3/DG4/DG8), tasks (obs #179, slice 3).
--
-- notificacion_preferencia: per-user opt-out for the daily digest email.
-- Absence of a row = opted in (DG3). Own-row select/insert/update only, no
-- admin bypass (unlike digest_envio) -- a user's own notification prefs are
-- not an audit surface. updated_at is trigger-owned via the NEW
-- private.touch_updated_at() function (correction C7): private.audit_fields()
-- cannot be reused here because it unconditionally assigns
-- new.created_by/new.updated_by, columns this table does not have.
--
-- digest_envio: append-only send log. Written ONLY by service_role (the Edge
-- Function), never by authenticated -- immutability AND write-authority are
-- both enforced at the grant layer, not by policy absence (mirrors
-- registro_acceso/tarea_comentario). Read: own row OR admin.ver (N6 closed
-- default). unique(usuario_id, fecha_envio) is the digest's idempotency key.

begin;

select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-np@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'usera-np@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'userb-np@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin NP', 'admin-np@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('22222222-2222-2222-2222-222222222222', 'Usuario A NP', 'usera-np@test.local',
   (select id from public.rol where nombre = 'Colaborador')),
  ('33333333-3333-3333-3333-333333333333', 'Usuario B NP', 'userb-np@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- ---------------------------------------------------------------------------
-- 1-4: structural -- RLS enabled AND forced on both new tables.
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class
           where relname = 'notificacion_preferencia' and relnamespace = 'public'::regnamespace),
  'notificacion_preferencia has RLS enabled');

select ok((select relforcerowsecurity from pg_class
           where relname = 'notificacion_preferencia' and relnamespace = 'public'::regnamespace),
  'notificacion_preferencia has RLS forced');

select ok((select relrowsecurity from pg_class
           where relname = 'digest_envio' and relnamespace = 'public'::regnamespace),
  'digest_envio has RLS enabled');

select ok((select relforcerowsecurity from pg_class
           where relname = 'digest_envio' and relnamespace = 'public'::regnamespace),
  'digest_envio has RLS forced');

-- ---------------------------------------------------------------------------
-- 5-6: default resumen_diario_email = true; own-row INSERT succeeds.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

with i as (
  insert into public.notificacion_preferencia (usuario_id) values
    ('22222222-2222-2222-2222-222222222222')
  returning resumen_diario_email
)
select is((select resumen_diario_email from i), true,
  'notificacion_preferencia.resumen_diario_email defaults to true (DG3: absence of a row = opted in)');

select ok((select count(*) = 1 from public.notificacion_preferencia
           where usuario_id = '22222222-2222-2222-2222-222222222222'),
  'usuario A can INSERT its own notificacion_preferencia row');

reset role;

-- userB inserts its own row too, needed for cross-user isolation checks below.
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';

insert into public.notificacion_preferencia (usuario_id) values
  ('33333333-3333-3333-3333-333333333333');

reset role;

-- ---------------------------------------------------------------------------
-- 7-8: own-row SELECT succeeds; cross-user SELECT returns zero rows (no
-- admin bypass on this table -- own-row-only, unlike digest_envio).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.notificacion_preferencia
           where usuario_id = '22222222-2222-2222-2222-222222222222'),
  'usuario A can SELECT its own notificacion_preferencia row');

select ok((select count(*) = 0 from public.notificacion_preferencia
           where usuario_id = '33333333-3333-3333-3333-333333333333'),
  'usuario A cannot SELECT usuario B''s notificacion_preferencia row (own-row-only, no admin exception)');

reset role;

-- ---------------------------------------------------------------------------
-- 9: cross-user INSERT spoof rejected (WITH CHECK usuario_id = auth.uid()).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select throws_ok(
  $$insert into public.notificacion_preferencia (usuario_id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501', null,
  'usuario A cannot INSERT a notificacion_preferencia row for usuario B (WITH CHECK usuario_id = auth.uid())');

reset role;

-- ---------------------------------------------------------------------------
-- 10-11: own-row UPDATE succeeds and the NEW private.touch_updated_at()
-- trigger measurably advances updated_at (not just "the trigger exists").
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

-- notificacion_preferencia.updated_at defaults to `now()`, which is FROZEN
-- for the whole transaction (pgTAP runs each file inside one transaction).
-- pg_sleep() advances the real wall clock; private.touch_updated_at() stamps
-- clock_timestamp() (real wall clock, not now()) on UPDATE. So a post-update
-- updated_at strictly greater than the transaction-frozen now() is a genuine
-- proof the trigger fired and advanced the timestamp -- not merely that the
-- trigger object exists.
select pg_sleep(0.01); -- not an assertion; ensures a measurable clock delta before the UPDATE

with u as (
  update public.notificacion_preferencia set resumen_diario_email = false
  where usuario_id = '22222222-2222-2222-2222-222222222222'
  returning resumen_diario_email, updated_at
)
select ok((select resumen_diario_email = false from u),
  'usuario A can UPDATE its own resumen_diario_email');

select ok((select updated_at > now() from public.notificacion_preferencia
           where usuario_id = '22222222-2222-2222-2222-222222222222'),
  'private.touch_updated_at() trigger measurably advances updated_at past the transaction-frozen now() on UPDATE');

reset role;

-- ---------------------------------------------------------------------------
-- 12: cross-user UPDATE affects zero rows (USING usuario_id = auth.uid()
-- hides usuario B's row from usuario A entirely -- no error, just no match).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

with u as (
  update public.notificacion_preferencia set resumen_diario_email = false
  where usuario_id = '33333333-3333-3333-3333-333333333333'
  returning 1
)
select ok((select count(*) = 0 from u),
  'usuario A''s UPDATE targeting usuario B''s row affects zero rows (USING clause hides it)');

reset role;

select ok((select resumen_diario_email = true from public.notificacion_preferencia
           where usuario_id = '33333333-3333-3333-3333-333333333333'),
  'usuario B''s row is unchanged after usuario A''s no-op cross-user UPDATE attempt (superuser bypass check)');

-- ---------------------------------------------------------------------------
-- 13-14: usuario_id and updated_at are NOT UPDATE-granted -- both are
-- identity/trigger-owned columns, tamper-proof exactly like the audit columns.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select throws_ok(
  $$update public.notificacion_preferencia set usuario_id = '33333333-3333-3333-3333-333333333333'
    where usuario_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'notificacion_preferencia.usuario_id is NOT UPDATE-granted (identity column)');

select throws_ok(
  $$update public.notificacion_preferencia set updated_at = now()
    where usuario_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'notificacion_preferencia.updated_at is NOT UPDATE-granted (trigger-owned)');

reset role;

-- ---------------------------------------------------------------------------
-- 15-16: no DELETE grant for anon/authenticated/service_role (the table
-- owner's implicit DELETE, which always appears in role_table_grants, is
-- deliberately excluded from this check -- it is not a security-relevant
-- grant, since anon/authenticated/service_role are the only roles PostgREST
-- and the Edge Function ever connect as); v_notificacion_preferencia is
-- security_invoker.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'notificacion_preferencia'
             and grantee in ('anon', 'authenticated', 'service_role')
             and privilege_type = 'DELETE'),
  'notificacion_preferencia has no DELETE grant for anon/authenticated/service_role');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_notificacion_preferencia' and relnamespace = 'public'::regnamespace),
  'v_notificacion_preferencia is a security_invoker view');

-- ---------------------------------------------------------------------------
-- 17-18: digest_envio -- authenticated has SELECT only, no INSERT/UPDATE/
-- DELETE grant at all (write-authority lives with service_role only).
-- ---------------------------------------------------------------------------
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'digest_envio'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'digest_envio grants SELECT to authenticated');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'digest_envio'
             and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  'digest_envio has NO INSERT/UPDATE/DELETE grant for authenticated (append-only, service_role-only writer)');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'digest_envio'
             and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE')),
  'digest_envio has NO UPDATE/DELETE grant for service_role either -- append-only even for the writer');

-- ---------------------------------------------------------------------------
-- 19-20: unique(usuario_id, fecha_envio) rejects a duplicate-day insert;
-- item_count > 0 CHECK enforced. Both exercised as service_role, the only
-- role with INSERT privilege.
-- ---------------------------------------------------------------------------
set local role service_role;

insert into public.digest_envio (usuario_id, fecha_envio, item_count) values
  ('22222222-2222-2222-2222-222222222222', '2026-07-30', 3);

select throws_ok(
  $$insert into public.digest_envio (usuario_id, fecha_envio, item_count)
    values ('22222222-2222-2222-2222-222222222222', '2026-07-30', 1)$$,
  '23505', null,
  'digest_envio.unique(usuario_id, fecha_envio) rejects a duplicate-day insert for the same user');

select throws_ok(
  $$insert into public.digest_envio (usuario_id, fecha_envio, item_count)
    values ('33333333-3333-3333-3333-333333333333', '2026-07-30', 0)$$,
  '23514', null,
  'digest_envio.item_count > 0 CHECK rejects a zero-item row');

-- A second, valid row for usuario B, used by the read-scoping checks below.
insert into public.digest_envio (usuario_id, fecha_envio, item_count) values
  ('33333333-3333-3333-3333-333333333333', '2026-07-30', 2);

reset role;

-- ---------------------------------------------------------------------------
-- 21-23: read scoping -- own-row select succeeds; a non-admin cannot read
-- another user's row; an admin.ver holder CAN read another user's row (N6).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.digest_envio
           where usuario_id = '22222222-2222-2222-2222-222222222222'),
  'usuario A can SELECT its own digest_envio row');

select ok((select count(*) = 0 from public.digest_envio
           where usuario_id = '33333333-3333-3333-3333-333333333333'),
  'usuario A (non-admin) cannot SELECT usuario B''s digest_envio row');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select ok((select count(*) = 1 from public.digest_envio
           where usuario_id = '33333333-3333-3333-3333-333333333333'),
  'admin (admin.ver) CAN SELECT usuario B''s digest_envio row (N6 closed default: own-row OR admin.ver)');

reset role;

-- ---------------------------------------------------------------------------
-- 24-25: digest_envio append-only -- UPDATE/DELETE rejected even for admin
-- (grant-layer immutability, not role-layer -- same discipline as
-- tarea_comentario/registro_acceso).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$update public.digest_envio set item_count = 99
    where usuario_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'admin cannot UPDATE digest_envio (no UPDATE grant at all, even for admin.ver holders)');

select throws_ok(
  $$delete from public.digest_envio where usuario_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null,
  'admin cannot DELETE digest_envio (no DELETE grant at all, even for admin.ver holders)');

reset role;

-- ---------------------------------------------------------------------------
-- 26-28: structural digest_envio CHECK re-confirmations under bypass-RLS
-- (superuser), independent of the RLS layer above.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.digest_envio (usuario_id, fecha_envio, item_count)
    values ('22222222-2222-2222-2222-222222222222', '2026-08-01', -1)$$,
  '23514', null,
  'digest_envio.item_count > 0 CHECK rejects a negative value too (superuser bypass-RLS proof)');

select ok((select count(*) = 1 from information_schema.table_constraints
           where table_schema = 'public' and table_name = 'digest_envio'
             and constraint_type = 'UNIQUE'),
  'digest_envio has exactly one UNIQUE constraint (usuario_id, fecha_envio)');

select ok((select count(*) = 0 from pg_trigger
           where tgrelid = 'public.digest_envio'::regclass and not tgisinternal),
  'digest_envio has no audit/touch trigger (append-only, created_at only, no updated_at)');

select * from finish();

rollback;
