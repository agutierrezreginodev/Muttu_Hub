-- pgTAP: kanban_columna migration (supabase/migrations/20260803150000_kanban_columna.sql).
--
-- That migration added `tarea.columna` + its pinned discriminator, promoted the
-- pair onto `catalogo(tipo, codigo)` via FK, and REBUILT `v_tarea` with
-- CREATE OR REPLACE to expose the new column. It shipped without a pgTAP test,
-- which failed the `migration-test-coverage` CI gate (scripts/check-migration-tests.sh,
-- spec T2) and — because ci.yml wires `pgtap` with `needs: migration-test-coverage`
-- and `e2e` with `needs: [..., pgtap]` — left BOTH of those jobs skipped on every
-- pull request in this repo. This file closes that gate.
--
-- What it asserts:
--   1. Structure: `columna` is NULLABLE text (spec KC3 — a tarea with a null
--      columna renders in the lowest-`orden` ACTIVE column, so null is a valid
--      steady state, not a defect); `columna_cat_tipo` is NOT NULL with the
--      pinned default and CHECK.
--   2. The pinned-discriminator mechanism: the CHECK rejects a forged tipo
--      literal, the default is really applied on a plain INSERT, and the FK
--      resolves against `catalogo(tipo, codigo)`.
--   3. Referential behaviour: ON DELETE RESTRICT and ON UPDATE RESTRICT are
--      real, triangulated against an UNUSED code that CAN still be deleted —
--      so the restrict is proven FK-driven rather than a blanket lock.
--   4. `v_tarea` REGRESSION, the actual risk in this migration: CREATE OR
--      REPLACE could have silently dropped the security_invoker flag, the
--      `authenticated` grants, the `deleted_at is null` filter or the derived
--      `vencido` column. Each is asserted to still hold, and the rebuilt view
--      is proven to still enforce `tarea`'s origen-aware RLS rather than having
--      become a read-around.
--
-- FIXTURES ARE SELF-CONTAINED BY NECESSITY, not by preference: no migration
-- seeds any `columna_tablero` code. The four board codes live only in
-- `supabase/seed_demo.sql`, a manual demo seed that `supabase start` does NOT
-- apply. A fresh CI database therefore has ZERO of them, so this file inserts
-- its own rather than depending on data that is not there.

begin;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser — bypasses RLS/grants entirely, same convention as
-- crm_catalogos.sql and dashboard_tareas_views.sql).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('96000001-9600-9600-9600-960000000001', 'kanban-only-columna@test.local'),
  ('96000002-9600-9600-9600-960000000002', 'sinver-columna@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('96000001-9600-9600-9600-960000000001', 'Kanban Only Columna',
   'kanban-only-columna@test.local',
   (select id from public.rol where nombre = 'Colaborador')),
  ('96000002-9600-9600-9600-960000000002', 'Sin Ver Columna',
   'sinver-columna@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Colaborador holds crm.ver AND kanban.ver by default seed. Override each
-- user so ONE is kanban.ver-only and the OTHER can see neither module (the
-- same "sinver" override pattern every other pgTAP file here uses).
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '96000001-9600-9600-9600-960000000001';
update public.usuario set permisos_override = '{"crm":{"ver": false},"kanban":{"ver": false}}'
  where id = '96000002-9600-9600-9600-960000000002';

-- Board columns. `en_uso` gets referenced by a tarea below; `sin_uso` never
-- does, which is what makes the ON DELETE RESTRICT assertion a triangulation
-- instead of a tautology.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('columna_tablero', 'en_uso',  'En uso',  1),
  ('columna_tablero', 'sin_uso', 'Sin uso', 2);

set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

-- K1: Kanban, en_curso, future fecha_limite, sitting in the `en_uso` column.
insert into public.tarea (id, titulo, responsable_id, fecha_limite, estado, origen, columna)
overriding system value values
  (9601, 'K1 Kanban en_uso', '96000001-9600-9600-9600-960000000001',
   now() + interval '5 days', 'en_curso', 'Kanban', 'en_uso');

-- K2: Kanban, pendiente, PAST fecha_limite, non-terminal -> vencido must stay true.
insert into public.tarea (id, titulo, responsable_id, fecha_limite, estado, origen)
overriding system value values
  (9602, 'K2 Kanban vencida', '96000001-9600-9600-9600-960000000001',
   now() - interval '2 days', 'pendiente', 'Kanban');

-- K3: Kanban, cumplido, PAST fecha_limite, TERMINAL -> vencido must stay false.
insert into public.tarea (id, titulo, responsable_id, fecha_limite, estado, origen)
overriding system value values
  (9603, 'K3 Kanban cumplida-vencida-pero-terminal',
   '96000001-9600-9600-9600-960000000001',
   now() - interval '3 days', 'cumplido', 'Kanban');

-- K4: Kanban, soft-deleted -> v_tarea must keep hiding it after the rebuild.
insert into public.tarea (id, titulo, responsable_id, estado, origen, deleted_at)
overriding system value values
  (9604, 'K4 Kanban borrada', '96000001-9600-9600-9600-960000000001',
   'pendiente', 'Kanban', now());

reset role;

-- ---------------------------------------------------------------------------
-- 1-8: structure.
-- ---------------------------------------------------------------------------
select has_column('public', 'tarea', 'columna',
  'tarea.columna exists');

select col_type_is('public', 'tarea', 'columna', 'text',
  'tarea.columna is text (a catalogo codigo, not an enum)');

select col_is_null('public', 'tarea', 'columna',
  'tarea.columna is NULLABLE (spec KC3 — null renders in the lowest-orden active column)');

select has_column('public', 'tarea', 'columna_cat_tipo',
  'tarea.columna_cat_tipo discriminator exists');

select col_not_null('public', 'tarea', 'columna_cat_tipo',
  'tarea.columna_cat_tipo is NOT NULL (the discriminator half of the FK is never optional)');

select ok(
  (select column_default like '%columna_tablero%'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'tarea'
      and column_name = 'columna_cat_tipo'),
  'tarea.columna_cat_tipo defaults to the columna_tablero literal');

select ok(
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.tarea'::regclass
      and conname = 'tarea_columna_cat_tipo_check'
      and pg_get_constraintdef(oid) like '%columna_tablero%'),
  'tarea_columna_cat_tipo_check pins the discriminator to columna_tablero');

select ok(
  (select pg_get_constraintdef(oid) like '%REFERENCES catalogo(tipo, codigo)%'
      and pg_get_constraintdef(oid) like '%ON UPDATE RESTRICT%'
      and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
     from pg_constraint
    where conrelid = 'public.tarea'::regclass and conname = 'tarea_columna_fk'),
  'tarea_columna_fk targets catalogo(tipo, codigo) with ON UPDATE/DELETE RESTRICT');

-- ---------------------------------------------------------------------------
-- 9-16: pinned-discriminator + FK behaviour.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.tarea set columna_cat_tipo = 'bogus' where id = 9601$$,
  '23514', null,
  'tarea.columna_cat_tipo CHECK rejects a forged literal (cannot be repointed at another catalog)');

select is(
  (select columna_cat_tipo from public.tarea where id = 9602),
  'columna_tablero',
  'the discriminator default is really applied on a plain INSERT that never mentions it');

select is(
  (select columna from public.tarea where id = 9602),
  null,
  'a tarea inserted without a columna keeps it null — the FK accepts NULL (MATCH SIMPLE)');

select throws_ok(
  $$update public.tarea set columna = 'no_existe' where id = 9601$$,
  '23503', null,
  'tarea.columna FK rejects a code absent from catalogo');

select lives_ok(
  $$update public.tarea set columna = 'sin_uso' where id = 9601$$,
  'tarea.columna FK accepts a code present in catalogo');

-- Put K1 back on `en_uso` so the restrict assertions below have a live
-- referencing row (and `sin_uso` goes back to being genuinely unused).
update public.tarea set columna = 'en_uso' where id = 9601;

select throws_ok(
  $$delete from public.catalogo where tipo = 'columna_tablero' and codigo = 'en_uso'$$,
  '23503', null,
  'a columna_tablero code referenced by an existing tarea cannot be deleted (ON DELETE RESTRICT)');

select throws_ok(
  $$update public.catalogo set codigo = 'renombrado' where tipo = 'columna_tablero' and codigo = 'en_uso'$$,
  '23503', null,
  'a referenced columna_tablero code cannot be renamed (ON UPDATE RESTRICT)');

select lives_ok(
  $$delete from public.catalogo where tipo = 'columna_tablero' and codigo = 'sin_uso'$$,
  'an UNUSED columna_tablero code CAN still be deleted (proves the restrict is FK-driven, not a blanket lock)');

-- ---------------------------------------------------------------------------
-- 17-24: v_tarea rebuild regression. CREATE OR REPLACE is the risky part of
-- this migration — each of these could have been silently lost.
-- ---------------------------------------------------------------------------
select has_column('public', 'v_tarea', 'columna',
  'v_tarea exposes columna (the whole point of the rebuild — listBoardTareas selects it)');

select ok(
  (select reloptions::text like '%security_invoker=true%'
     from pg_class
    where relname = 'v_tarea' and relnamespace = 'public'::regnamespace),
  'v_tarea is STILL a security_invoker view after CREATE OR REPLACE');

select ok(
  has_table_privilege('authenticated', 'public.v_tarea', 'select'),
  'authenticated STILL holds SELECT on v_tarea (CREATE OR REPLACE preserved the original grant)');

select ok(
  not has_table_privilege('authenticated', 'public.v_tarea', 'insert')
    and not has_table_privilege('authenticated', 'public.v_tarea', 'update')
    and not has_table_privilege('authenticated', 'public.v_tarea', 'delete'),
  'the rebuild did not hand authenticated any write privilege on v_tarea');

select is(
  (select columna from public.v_tarea where id = 9601),
  'en_uso',
  'v_tarea.columna round-trips the stored value');

select ok(
  (select vencido from public.v_tarea where id = 9602),
  'v_tarea.vencido is STILL true for a non-terminal tarea past its fecha_limite');

select ok(
  (select not vencido from public.v_tarea where id = 9603),
  'v_tarea.vencido is STILL false for a TERMINAL tarea past its fecha_limite');

select ok(
  (select count(*) = 0 from public.v_tarea where id = 9604),
  'v_tarea STILL hides soft-deleted rows (the deleted_at filter survived the rebuild)');

-- ---------------------------------------------------------------------------
-- 25-26: the rebuilt view still routes through tarea's origen-aware RLS.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

select is(
  (select columna from public.v_tarea where id = 9601),
  'en_uso',
  'a kanban.ver-only caller reads a Kanban tarea columna through the rebuilt v_tarea');

set local request.jwt.claims to '{"sub":"96000002-9600-9600-9600-960000000002"}';

select ok(
  (select count(*) = 0 from public.v_tarea where id in (9601, 9602, 9603)),
  'a caller holding neither crm.ver nor kanban.ver sees ZERO rows — the rebuild did not become an RLS read-around');

reset role;

-- ---------------------------------------------------------------------------
-- 27: the migration documents itself as safe to re-run.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$alter table public.tarea add column if not exists columna text$$,
  'the migration''s add-column step is idempotent (re-running it is a no-op)');

select * from finish();

rollback;
