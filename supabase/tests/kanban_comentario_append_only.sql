-- pgTAP: kanban_comentario migration (kanban-module slice 2, §5.2 — comment
-- thread) — tarea_comentario, append-only. Mirrors public.bitacora_cliente
-- (crm-module PR4) STRUCTURALLY: no audit columns beyond created_at, no
-- deleted_at, no soft-delete RPC. Corrections are new entries, never edits.
-- Visibility/authorship differs only in WHICH resolver is called:
-- private.tarea_visible(tarea_id) / private.tarea_origen_permite(tarea_id,
-- 'crear') (the origen-aware seam from kanban-module slice 1a) replace
-- private.cliente_visible(cliente_id).
-- Source: sdd/kanban-module/design (Engram obs #176 §4, D7/D8), spec
-- (obs #174, KM1-KM4), tasks (obs #179, slice 2).

begin;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'gerencia@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'sinver@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('22222222-2222-2222-2222-222222222222', 'Gerencia', 'gerencia@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador')),
  ('66666666-6666-6666-6666-666666666666', 'Sin Ver Kanban', 'sinver@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

-- Coordinador's role grants kanban.ver=true AND kanban.crear=true; force THIS
-- one user's effective kanban.ver to false via permisos_override (leaving
-- kanban.crear=true from the role, per_key merge in has_permission), so
-- "kanban.crear WITHOUT kanban.ver cannot insert" is a real, exercised path.
update public.usuario set permisos_override = '{"kanban":{"ver": false}}'
  where id = '66666666-6666-6666-6666-666666666666';

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- t701: Kanban-origin, live, responsable Coordinador -- the main happy-path task.
-- t702: CRM-origin, live, responsable Coordinador -- module-gate proof (a
--       kanban-only caller with no crm.ver must not see or write its comments).
-- t703: Kanban-origin, soft-deleted -- visibility-follow proof.
insert into public.tarea (id, titulo, origen, estado, responsable_id, prioridad, fecha_limite)
overriding system value values
  (701, 'Tarea Kanban Con Comentarios', 'Kanban', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Alta', null),
  (702, 'Compromiso CRM Sin Kanban', 'CRM', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Media', null),
  (703, 'Tarea Kanban Borrada', 'Kanban', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 'Baja', null);
update public.tarea set deleted_at = now() where id = 703;

-- ---------------------------------------------------------------------------
-- 1-3: Coordinador (kanban.ver + kanban.crear, responsable of t701) can
-- append to a Kanban-origin task; autor_id is forced to the caller.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

with i as (
  insert into public.tarea_comentario (tarea_id, autor_id, texto)
  values (701, '44444444-4444-4444-4444-444444444444', 'Primer avance de la tarea')
  returning autor_id
)
select is((select autor_id from i), '44444444-4444-4444-4444-444444444444'::uuid,
  'coordinador can INSERT a comentario with autor_id = own auth.uid()');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (701, '11111111-1111-1111-1111-111111111111', 'Suplantacion')$$,
  '42501', null, 'coordinador cannot spoof autor_id to another user (RLS with check rejects mismatch)');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto) values (701, null, 'sin autor')$$,
  '42501', null, 'coordinador omitting autor_id fails via RLS (null never satisfies autor_id = auth.uid()), never silently defaulted');

reset role;

-- Superuser bypasses RLS entirely, so this proves the column's own NOT NULL
-- constraint independently of the RLS layer above.
select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto) values (701, null, 'sin autor, bypass RLS')$$,
  '23502', null, 'autor_id column itself is NOT NULL (superuser/RLS-bypass proof, independent of the policy check)');

-- ---------------------------------------------------------------------------
-- 4-5: Gerencia (kanban.ver only, no kanban.crear) can read but cannot write.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.tarea_comentario where tarea_id = 701),
  'gerencia (kanban.ver) can SELECT the comentario authored by coordinador');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (701, '22222222-2222-2222-2222-222222222222', 'Intento gerencia')$$,
  '42501', null, 'gerencia (no kanban.crear) cannot INSERT a comentario');

reset role;

-- ---------------------------------------------------------------------------
-- 6-7: KM4 -- ANY kanban.crear holder writes to ANY visible task's comment
-- thread, zero ownership/responsable restriction. Colaborador has no
-- relationship whatsoever to t701 (responsable is Coordinador), yet succeeds.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select lives_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (701, '55555555-5555-5555-5555-555555555555', 'Comentario de colaborador sin relacion con la tarea')$$,
  'colaborador (kanban.crear, NOT the responsable) can comment on t701 -- no ownership gate (KM4)');

select ok((select count(*) = 2 from public.tarea_comentario where tarea_id = 701),
  't701 now has entries from 2 different, unrelated authors -- confirms open write access');

reset role;

-- ---------------------------------------------------------------------------
-- 8-9: KM3 -- read reach: any kanban.ver holder sees every entry regardless
-- of author (no per-author restriction).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 2 from public.tarea_comentario where tarea_id = 701),
  'gerencia (kanban.ver, authored nothing) reads ALL comentarios for t701, both authors');

select ok((select count(distinct autor_id) = 2 from public.tarea_comentario where tarea_id = 701),
  'both distinct authors'' comentarios are visible to a third-party kanban.ver holder');

reset role;

-- ---------------------------------------------------------------------------
-- 10-11: kanban.crear WITHOUT kanban.ver cannot insert (D7's dual predicate).
-- The forced-override user retains kanban.crear=true from the Coordinador
-- role but has kanban.ver=false, so tarea_visible(701) is false and BOTH
-- SELECT and INSERT are rejected -- proving 'ver' AND 'crear' are both
-- required, not merely 'crear'.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';

select ok((select count(*) = 0 from public.tarea_comentario where tarea_id = 701),
  'user with kanban.crear but kanban.ver forced false sees zero comentarios (tarea_visible = false)');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (701, '66666666-6666-6666-6666-666666666666', 'Intento sin ver')$$,
  '42501', null, 'user with kanban.crear but kanban.ver forced false cannot INSERT (tarea_visible required even with crear)');

reset role;

-- ---------------------------------------------------------------------------
-- 12-13: module gate -- a CRM-origin task's comments are invisible to a
-- caller who lacks crm.ver, even though they hold kanban.ver/crear. Colaborador
-- (Colaborador role: crm.ver=true, kanban.ver=true per seed.sql) is NOT a
-- valid negative fixture here, so force crm.ver=false on Coordinador's own
-- override for THIS assertion set only, scoped inside the transaction.
-- ---------------------------------------------------------------------------
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '55555555-5555-5555-5555-555555555555';

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select ok((select count(*) = 0 from public.tarea_comentario where tarea_id = 702),
  'caller lacking crm.ver (forced override) sees zero comentarios on a CRM-origin task, despite holding kanban.ver/crear');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (702, '55555555-5555-5555-5555-555555555555', 'Intento en tarea CRM sin permiso CRM')$$,
  '42501', null, 'caller lacking crm.ver cannot INSERT on a CRM-origin task (tarea_visible/tarea_origen_permite gate the origen module, not just kanban)');

reset role;

update public.usuario set permisos_override = null
  where id = '55555555-5555-5555-5555-555555555555';

-- ---------------------------------------------------------------------------
-- 14-15: visibility follow -- comentarios of a soft-deleted tarea are
-- invisible via tarea_visible(), and new inserts against it are rejected too.
-- ---------------------------------------------------------------------------
insert into public.tarea_comentario (id, tarea_id, autor_id, texto) overriding system value values
  (9001, 703, '11111111-1111-1111-1111-111111111111', 'Nota previa al borrado');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 0 from public.tarea_comentario where tarea_id = 703),
  'comentarios of a soft-deleted tarea are invisible (tarea_visible = false)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto)
    values (703, '44444444-4444-4444-4444-444444444444', 'No deberia poder')$$,
  '42501', null, 'coordinador cannot INSERT into a soft-deleted tarea''s comentario thread (tarea_visible = false)');

reset role;

-- ---------------------------------------------------------------------------
-- 16-17: CHECK rejects blank/whitespace-only texto.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto) values (701, '44444444-4444-4444-4444-444444444444', '')$$,
  '23514', null, 'tarea_comentario.texto CHECK rejects an empty string');

select throws_ok(
  $$insert into public.tarea_comentario (tarea_id, autor_id, texto) values (701, '44444444-4444-4444-4444-444444444444', '   ')$$,
  '23514', null, 'tarea_comentario.texto CHECK rejects a whitespace-only string');

-- ---------------------------------------------------------------------------
-- 18-21: append-only genuinely -- UPDATE and DELETE rejected at the GRANT
-- layer for authenticated, not merely by a missing/rejecting policy. Proven
-- for BOTH a non-privileged role (coordinador) and the most-privileged role
-- (administrador, who holds kanban.eliminar/editar on tarea itself) -- the
-- absence of the grant is what blocks it, not permissions.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$update public.tarea_comentario set texto = 'editado' where id = 9001$$,
  '42501', null, 'coordinador cannot UPDATE tarea_comentario (no UPDATE grant at all, append-only)');

select throws_ok(
  $$delete from public.tarea_comentario where id = 9001$$,
  '42501', null, 'coordinador cannot DELETE tarea_comentario (no DELETE grant at all, append-only)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$update public.tarea_comentario set texto = 'editado por admin' where id = 9001$$,
  '42501', null, 'administrador (kanban.eliminar/editar on tarea itself) STILL cannot UPDATE tarea_comentario');

select throws_ok(
  $$delete from public.tarea_comentario where id = 9001$$,
  '42501', null, 'administrador STILL cannot DELETE tarea_comentario -- immutability is grant-layer, not role-layer');

reset role;

select ok((select texto from public.tarea_comentario where id = 9001) = 'Nota previa al borrado',
  'tarea_comentario row content is unchanged after every rejected UPDATE attempt (superuser bypass check)');

-- ---------------------------------------------------------------------------
-- 22-25: structural proof of the grant-layer mechanism itself -- no
-- UPDATE/DELETE privilege exists in information_schema for EITHER role.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'tarea_comentario'
             and grantee = 'authenticated' and privilege_type in ('UPDATE', 'DELETE')),
  'tarea_comentario has no UPDATE/DELETE grant for authenticated at all');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'tarea_comentario'
             and grantee = 'service_role' and privilege_type in ('UPDATE', 'DELETE')),
  'tarea_comentario has no UPDATE/DELETE grant for service_role either');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'tarea_comentario'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'tarea_comentario grants SELECT to authenticated');

select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'tarea_comentario'
             and grantee = 'authenticated' and privilege_type = 'INSERT'),
  'tarea_comentario grants INSERT to authenticated');

-- ---------------------------------------------------------------------------
-- 26-27: RLS enabled AND forced.
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class
           where relname = 'tarea_comentario' and relnamespace = 'public'::regnamespace),
  'tarea_comentario has RLS enabled');

select ok((select relforcerowsecurity from pg_class
           where relname = 'tarea_comentario' and relnamespace = 'public'::regnamespace),
  'tarea_comentario has RLS forced');

-- ---------------------------------------------------------------------------
-- 28-29: structural -- mirrors bitacora_cliente/registro_acceso, not the
-- domain-table pattern; no soft-delete RPC.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from pg_trigger
           where tgrelid = 'public.tarea_comentario'::regclass and not tgisinternal),
  'tarea_comentario has no audit trigger (mirrors bitacora_cliente/registro_acceso)');

select ok((select count(*) = 0 from information_schema.columns
           where table_schema = 'public' and table_name = 'tarea_comentario'
             and column_name in ('updated_at', 'updated_by', 'deleted_at')),
  'tarea_comentario has no updated_at/updated_by/deleted_at columns (append-only, created_at only)');

select * from finish();

rollback;
