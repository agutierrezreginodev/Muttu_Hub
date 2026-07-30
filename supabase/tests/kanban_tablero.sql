-- pgTAP: kanban_tablero migration (kanban-module PR1a, §5.1) — board columns
-- as catalog data (tarea.columna + pinned discriminator + composite FK,
-- mirroring tarea.prioridad), the additive column-grant extension (M1),
-- private.tarea_origen_permite/tarea_visible (the ONE origen-aware
-- authorization seam every future Kanban child-table RLS policy must call),
-- and the v_tarea rebuild (must preserve responsable_id + the byte-identical
-- vencido expression + tarea.estado's untouched CHECK, per KC7).
-- Source: sdd/kanban-module/design (Engram obs #176 §3/§7, obs #177 §8),
-- spec (obs #174, KC1-KC8), tasks (obs #179, slice 1a).
--
-- Scope note: this file does NOT test private.soft_delete_catalogo's CAT5
-- guard extension to tarea.columna — that is slice 1b's own migration and
-- own test additions (regression-risk isolation, sdd/kanban-module/tasks).

begin;

select plan(36);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'sinver@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('66666666-6666-6666-6666-666666666666', 'Sin Ver Kanban', 'sinver@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

-- Coordinador's role grants kanban.ver=true; force THIS one user's effective
-- kanban.ver to false via permisos_override (has_permission's override key
-- beats the role), so "tarea_visible false without kanban.ver" is a real,
-- exercised path rather than an assumption.
update public.usuario set permisos_override = '{"kanban":{"ver": false}}'
  where id = '66666666-6666-6666-6666-666666666666';

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.tarea (id, titulo, origen, estado, responsable_id, prioridad, fecha_limite)
overriding system value values
  (601, 'Tarea Kanban Activa', 'Kanban', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Alta', null),
  (602, 'Tarea Kanban Borrada', 'Kanban', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Media', null),
  (603, 'Tarea Kanban Vencida', 'Kanban', 'en_curso',
   '44444444-4444-4444-4444-444444444444', 'Alta', now() - interval '1 day'),
  (604, 'Tarea Kanban Cumplida Vencida', 'Kanban', 'cumplido',
   '44444444-4444-4444-4444-444444444444', 'Baja', now() - interval '1 day');
update public.tarea set deleted_at = now() where id = 602;

-- ---------------------------------------------------------------------------
-- 1-2: seeds. Exactly the 5 columna_tablero codes and 4 etiqueta_tarea codes
-- the design DDL commits to (design §3 item 1, spec KC1/KC4).
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.catalogo where tipo = 'columna_tablero'), 5,
  'exactly 5 columna_tablero codes seeded');

select is((select count(*)::int from public.catalogo where tipo = 'etiqueta_tarea'), 4,
  'exactly 4 etiqueta_tarea codes seeded');

-- ---------------------------------------------------------------------------
-- 3: terminal codes exist under the exact names the app-side map depends on.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.catalogo
           where tipo = 'columna_tablero' and codigo in ('cumplido', 'cancelado')), 2,
  'both reserved terminal columna_tablero codes (cumplido, cancelado) are seeded');

-- ---------------------------------------------------------------------------
-- 4-5: structural — tarea.columna + pinned discriminator columns exist.
-- ---------------------------------------------------------------------------
select has_column('public', 'tarea', 'columna', 'tarea.columna exists');
select has_column('public', 'tarea', 'columna_cat_tipo', 'tarea.columna_cat_tipo exists');

-- ---------------------------------------------------------------------------
-- 6: M1(a) — the actual guard against "two grant statements, one forgotten".
-- Counts BOTH grantees in ONE assertion; a per-role lives_ok() would pass
-- with service_role's grant missing.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'tarea'
      and column_name = 'columna' and privilege_type = 'UPDATE'
      and grantee in ('authenticated', 'service_role')),
  2,
  'tarea.columna has UPDATE granted to BOTH authenticated and service_role');

-- ---------------------------------------------------------------------------
-- 7: M1(b) — behavioural assertion: an actual authenticated UPDATE succeeds.
-- Never inferred from the grant statement alone.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$update public.tarea set columna = 'en_revision' where id = 601$$,
  'authenticated (kanban.editar) can UPDATE tarea.columna');

-- ---------------------------------------------------------------------------
-- 8: M1(c) — the discriminator must stay ungranted, same tamper-proofing as
-- the audit columns and deleted_at.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.tarea set columna_cat_tipo = 'otro' where id = 601$$,
  '42501', null,
  'columna_cat_tipo is NOT UPDATE-granted, even to kanban.editar holders');

-- ---------------------------------------------------------------------------
-- 9-10: composite FK rejects an unlisted columna code; accepts a seeded one.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.tarea set columna = 'no_existe' where id = 601$$,
  '23503', null,
  'tarea_columna_fk rejects an unlisted columna_tablero code');

select lives_ok(
  $$update public.tarea set columna = null where id = 601$$,
  'tarea_columna_fk accepts NULL (MATCH SIMPLE, D3 nullable-columna tradeoff)');

reset role;

-- ---------------------------------------------------------------------------
-- 11: discriminator CHECK rejects a forged tipo literal (grant-layer
-- exclusion means only a superuser/table owner can reach the CHECK itself).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.tarea set columna_cat_tipo = 'bogus' where id = 601$$,
  '23514', null,
  'tarea.columna_cat_tipo CHECK rejects a forged literal');

-- ---------------------------------------------------------------------------
-- 12-14: indexes (design D6). Confirms the pre-existing responsable/vencidas
-- indexes are NOT dropped, and the 3 new ones exist.
-- ---------------------------------------------------------------------------
select has_index('public', 'tarea', 'tarea_columna_idx',
  'tarea_columna_idx exists');
select has_index('public', 'tarea', 'tarea_responsable_vencimiento_idx',
  'tarea_responsable_vencimiento_idx exists');
select has_index('public', 'tarea', 'tarea_etiquetas_gin_idx',
  'tarea_etiquetas_gin_idx exists');

select has_index('public', 'tarea', 'tarea_responsable_idx',
  'pre-existing tarea_responsable_idx is NOT dropped (composite is partial, not a full replacement)');
select has_index('public', 'tarea', 'tarea_vencidas_idx',
  'pre-existing tarea_vencidas_idx is NOT dropped');

-- ---------------------------------------------------------------------------
-- 17-18: private.tarea_origen_permite / private.tarea_visible exist as
-- stable, security definer, search_path pinned functions (design D7).
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.provolatile = 's'
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'tarea_origen_permite'),
  'private.tarea_origen_permite is stable, security definer, search_path pinned');

select ok(
  (select p.prosecdef and p.provolatile = 's'
     and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'tarea_visible'),
  'private.tarea_visible is stable, security definer, search_path pinned');

-- ---------------------------------------------------------------------------
-- 19-20: neither is granted to anon/public (no dynamic execute path).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'private' and routine_name = 'tarea_origen_permite'
      and grantee in ('anon', 'public')),
  0,
  'private.tarea_origen_permite is NOT granted to anon or public');

select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'private' and routine_name = 'tarea_visible'
      and grantee in ('anon', 'public')),
  0,
  'private.tarea_visible is NOT granted to anon or public');

-- ---------------------------------------------------------------------------
-- 21-24: behavioural — tarea_visible / tarea_origen_permite return false for
-- a soft-deleted tarea and for a caller lacking the origen-appropriate 'ver';
-- return true for a normally-visible Kanban tarea held by a kanban.ver holder.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select ok((select private.tarea_visible(601)),
  'tarea_visible(601) true for a live Kanban tarea and a kanban.ver holder');

select ok(not (select private.tarea_visible(602)),
  'tarea_visible(602) false for a soft-deleted tarea, even for a kanban.ver holder');

select ok((select private.tarea_origen_permite(601, 'editar')),
  'tarea_origen_permite(601, editar) true for a kanban.editar holder on a Kanban tarea');

set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';

select ok(not (select private.tarea_visible(601)),
  'tarea_visible(601) false for a caller whose effective kanban.ver is false (override)');

reset role;

-- ---------------------------------------------------------------------------
-- 25-29: view-contract preservation (KC7) — must land BEFORE any consumer of
-- v_tarea exists. responsable_id still exposed; columna exposed;
-- columna_cat_tipo NOT exposed; vencido expression byte-identical to
-- audit.sql:245 (verified via pg_get_viewdef against the pre-migration
-- baseline); tarea.estado CHECK still holds exactly the five known values.
-- ---------------------------------------------------------------------------
select has_column('public', 'v_tarea', 'responsable_id',
  'v_tarea still exposes responsable_id');

select has_column('public', 'v_tarea', 'columna',
  'v_tarea exposes the new columna column');

select hasnt_column('public', 'v_tarea', 'columna_cat_tipo',
  'v_tarea does NOT expose the columna_cat_tipo discriminator');

select ok(
  pg_get_viewdef('public.v_tarea'::regclass, true) like
    '%fecha_limite IS NOT NULL AND fecha_limite < now() AND (estado <> ALL (ARRAY[''cumplido''::text, ''cancelado''::text])) AS vencido%',
  'v_tarea.vencido expression is byte-identical to audit.sql:245 (verified pre-migration baseline)');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'tarea_estado_check' and conrelid = 'public.tarea'::regclass),
  'CHECK ((estado = ANY (ARRAY[''borrador''::text, ''pendiente''::text, ''en_curso''::text, ''cumplido''::text, ''cancelado''::text])))',
  'tarea_estado_check still holds exactly the five known values, byte-identical to platform-foundation');

-- ---------------------------------------------------------------------------
-- 30-33: v_tarea.vencido behavioural cross-check — same rows, both the
-- underlying formula (estado not in a terminal state and fecha_limite in the
-- past) and the view agree. Non-terminal + past-due => vencido; terminal +
-- past-due => NOT vencido.
-- ---------------------------------------------------------------------------
select ok((select vencido from public.v_tarea where id = 603),
  'v_tarea.vencido true for a non-terminal (en_curso) tarea past its fecha_limite');

select ok(not (select vencido from public.v_tarea where id = 604),
  'v_tarea.vencido false for a terminal (cumplido) tarea past its fecha_limite');

select ok((select count(*) = 0 from public.v_tarea where id = 602),
  'v_tarea excludes the soft-deleted tarea entirely (deleted_at is null filter unchanged)');

select ok((select count(*) = 1 from public.v_tarea where id = 601),
  'v_tarea includes a live Kanban tarea');

-- ---------------------------------------------------------------------------
-- 34-35: tarea_origen_check is untouched (KC7/design: not touched by this
-- migration), and no new policy was added to public.tarea (Kanban reads an
-- already-secured table — zero new RLS surface on tarea itself).
-- ---------------------------------------------------------------------------
select ok((select count(*) = 1 from pg_constraint
           where conname = 'tarea_origen_check' and conrelid = 'public.tarea'::regclass),
  'tarea_origen_check is untouched by this migration');

select is((select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'tarea'), 3,
  'public.tarea still has exactly its 3 pre-existing policies (select/insert/update) — zero new policies');

-- ---------------------------------------------------------------------------
-- 36: v_tarea keeps its security_invoker posture through the replace.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_tarea' and relnamespace = 'public'::regnamespace),
  'v_tarea remains a security_invoker view after the rebuild');

select * from finish();

rollback;
