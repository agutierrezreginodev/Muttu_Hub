-- pgTAP: kanban_soft_delete_catalogo_columna migration (kanban-module PR1b,
-- §5.1 KC5) — extends private.soft_delete_catalogo's CAT5 referential guard
-- to tarea.columna, replacing the function starting from its CURRENT live
-- 9-branch body (20260728193509_crm_contacto_oportunidad.sql:352-397), never
-- the stale PR1 1-branch version. Also asserts the deliberate NON-extension
-- to etiqueta_tarea (design D4/spec KC5) and reconfirms every pre-existing
-- guard branch still raises.
-- Source: sdd/kanban-module/design (Engram obs #176 §3 item 7, correction
-- C3), spec (obs #174, KC5), tasks (obs #179, slice 1b).
--
-- Regression-risk isolation, the actual point of this file: M2(c) proves the
-- PR1/PR3 `prioridad` and `estado_oportunidad` guard branches survive this
-- replace. If either fails, the function was copied from the wrong (stale)
-- body — this is not optional coverage.

begin;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.cliente (id, nombre, estado) overriding system value values
  (701, 'Cliente Kanban Guard', 'activo');

-- tarea rows: one pins the in-use columna_tablero code ('por_hacer'), one
-- carries the pre-existing prioridad code ('Alta') to prove that guard
-- branch survives, one carries the etiqueta_tarea code ('comercial') to
-- prove the deliberate NON-guard on tags. None reference 'cancelado' or
-- 'en_curso', which stay unused for the negative/positive assertions below.
insert into public.tarea (id, titulo, origen, estado, responsable_id, prioridad, columna, etiquetas)
overriding system value values
  (701, 'Tarea Columna En Uso', 'Kanban', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Alta', 'por_hacer', array['comercial']::text[]);

-- oportunidad.estado defaults to 'abierta' (estado_oportunidad/abierta is the
-- one seeded code the platform's own NOT NULL DEFAULT requires) -- a bare
-- insert with no cliente_id dependency on visibility (the CAT5 branch checks
-- only o.deleted_at, not cliente_visible) proves the estado_oportunidad
-- branch without any extra machinery.
insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (900, 701, 'Oportunidad Guard Check');

-- documento fixture for M2(e). categoria_documento codes are not seeded by any
-- migration (documentos_repositorio_rls.sql:32-36 seeds its own), so this file
-- seeds the one code it needs. A dedicated code name keeps it disjoint from
-- every other assertion here.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'acta_guard', 'Acta Guard Check', 1);

insert into public.documento (id, cliente_id, nombre, categoria)
overriding system value values
  (701, 701, 'Documento Guard Check', 'acta_guard');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- ---------------------------------------------------------------------------
-- 1: M2(a) — the actual new branch. Rejects deactivating an in-use
-- columna_tablero code.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.soft_delete_catalogo('columna_tablero', 'por_hacer')$$,
  '23503', null,
  'soft_delete_catalogo guard extended: rejects deactivating a columna_tablero code in use by tarea.columna');

-- ---------------------------------------------------------------------------
-- 2: M2(b) — an unused columna_tablero code deactivates cleanly.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.soft_delete_catalogo('columna_tablero', 'cancelado')$$,
  'soft_delete_catalogo succeeds deactivating a columna_tablero code no tarea references');

select ok((select not activo from public.catalogo where tipo = 'columna_tablero' and codigo = 'cancelado'),
  'soft_delete_catalogo actually flipped activo to false for the unused columna_tablero code');

-- ---------------------------------------------------------------------------
-- 3-4: M2(c) — regression tripwire (the actual point of correction C3). Both
-- pre-existing guard branches from the PR1/PR3 body must still raise. If
-- either lives_ok's instead of throwing, the function was copied from the
-- stale PR1 1-branch body, silently dropping 7 guards.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.soft_delete_catalogo('prioridad', 'Alta')$$,
  '23503', null,
  'soft_delete_catalogo guard SURVIVES: rejects deactivating a prioridad code in use by tarea.prioridad (pre-existing PR1/PR2 branch)');

select throws_ok(
  $$select public.soft_delete_catalogo('estado_oportunidad', 'abierta')$$,
  '23503', null,
  'soft_delete_catalogo guard SURVIVES: rejects deactivating an estado_oportunidad code in use by oportunidad (pre-existing PR3 branch)');

-- ---------------------------------------------------------------------------
-- 5: M2(e) — the documentos branch (correction C4). This migration's timestamp
-- (20260730190554) is LATER than documentos' (20260730130000), so this file's
-- body applies last and wins outright: if the documento.categoria branch is
-- ever dropped from it again, this assertion is what fails. It exists because
-- the original body DID drop it, and nothing in this PR's own CI noticed --
-- the base branch predated documentos, so documentos_repositorio_rls.sql:259
-- was not even present to fail.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.soft_delete_catalogo('categoria_documento', 'acta_guard')$$,
  '23503', null,
  'soft_delete_catalogo guard SURVIVES: rejects deactivating a categoria_documento code in use by documento (documentos branch, added by correction C4)');

-- ---------------------------------------------------------------------------
-- 6-7: M2(d) — deliberate NON-extension (design D4 / spec KC5). Deactivating
-- an in-use etiqueta_tarea code MUST succeed: tags are historical free text,
-- not referentially guarded like every other catalog tipo.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.soft_delete_catalogo('etiqueta_tarea', 'comercial')$$,
  'soft_delete_catalogo deliberately does NOT guard etiqueta_tarea: deactivating an in-use tag code succeeds');

select ok((select not activo from public.catalogo where tipo = 'etiqueta_tarea' and codigo = 'comercial'),
  'etiqueta_tarea code actually deactivated');

select ok((select 'comercial' = any(etiquetas) from public.tarea where id = 701),
  'the existing tarea.etiquetas value still contains the now-deactivated code -- historical label preserved as free text, unchanged');

reset role;

-- ---------------------------------------------------------------------------
-- 8: RLS matrix on tarea reconfirmed unchanged -- this migration replaces
-- only a definer function, adds zero new policies on public.tarea (same
-- invariant slice 1a already established; reconfirmed here because this is
-- a distinct migration/PR).
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'tarea'), 3,
  'public.tarea still has exactly its 3 pre-existing policies after the soft_delete_catalogo replace -- zero new policies');

select * from finish();

rollback;
