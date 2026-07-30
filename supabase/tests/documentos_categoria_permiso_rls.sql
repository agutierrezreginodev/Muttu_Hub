-- pgTAP: documentos_categoria_permiso migration (documentos-repositorio PR1,
-- tasks 1.1/1.2) -- the documento_categoria_permiso grant table and the
-- private.categoria_visible(text) resolver.
-- Source: sdd/documentos-repositorio/design, Decision 4; sdd/documentos-
-- repositorio/specs/document-permissions/spec.md.
--
-- This is the DB category-permission foundation ONLY (PR1). There is no
-- `documento` table yet (that ships in PR2) -- these assertions cover just
-- the grant table + resolver in isolation, exactly as tasks.md scopes PR1.
--
-- categoria_documento codes referenced below ('contratos', 'legal') are
-- test-local fixture rows inserted into public.catalogo inside this
-- transaction (rolled back at the end); Decision 8 keeps the catalog
-- genuinely empty in every real migration/seed.

begin;

select plan(15);

-- Fixtures (superuser). Reuses the same role shape as every other pgTAP file
-- in this repo (seed.sql: Administrador/Coordinador/Colaborador).
insert into auth.users (id, email) values
  ('61616161-6161-6161-6161-616161616161', 'admin-catperm@test.local'),
  ('62626262-6262-6262-6262-626262626262', 'coord-catperm@test.local'),
  ('63636363-6363-6363-6363-636363636363', 'colab-catperm@test.local'),
  ('64646464-6464-6464-6464-646464646464', 'inactive-catperm@test.local');

insert into public.usuario (id, nombre, email, rol_id, activo) values
  ('61616161-6161-6161-6161-616161616161', 'Admin CatPerm', 'admin-catperm@test.local',
   (select id from public.rol where nombre = 'Administrador'), true),
  ('62626262-6262-6262-6262-626262626262', 'Coordinador CatPerm', 'coord-catperm@test.local',
   (select id from public.rol where nombre = 'Coordinador'), true),
  ('63636363-6363-6363-6363-636363636363', 'Colaborador CatPerm', 'colab-catperm@test.local',
   (select id from public.rol where nombre = 'Colaborador'), true),
  ('64646464-6464-6464-6464-646464646464', 'Inactive CatPerm', 'inactive-catperm@test.local',
   (select id from public.rol where nombre = 'Coordinador'), false);

-- Test-only categoria_documento catalog codes (Decision 8: ships empty in
-- every real migration; the FK below needs a real referent to grant).
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'contratos', 'Contratos', 1),
  ('categoria_documento', 'legal', 'Legal', 2);

-- Coordinador is granted 'contratos' (superuser insert -- bypasses RLS; the
-- grant table's own write gate is proven independently in tests 7-10 below).
insert into public.documento_categoria_permiso (rol_id, categoria) values
  ((select id from public.rol where nombre = 'Coordinador'), 'contratos');

-- 1-2: categoria_visible resolves true with a grant, false without (same
-- role, a category it was never granted).
set local role authenticated;
set local request.jwt.claims to '{"sub":"62626262-6262-6262-6262-626262626262"}';

select is((select private.categoria_visible('contratos')), true,
  'categoria_visible: coordinador WITH a grant on contratos resolves true');

select is((select private.categoria_visible('legal')), false,
  'categoria_visible: coordinador WITHOUT a grant on legal resolves false (fail-closed)');

-- 3: fail-closed for no auth.uid() (anonymous claims).
set local request.jwt.claims to '{}';
select is(coalesce((select private.categoria_visible('contratos')), false), false,
  'categoria_visible: anonymous claims (no auth.uid()) resolve to false');

-- 4: fail-closed for a deactivated user, even though their role holds the
-- grant (activo gate is independent from the grant itself).
set local request.jwt.claims to '{"sub":"64646464-6464-6464-6464-646464646464"}';
select is(coalesce((select private.categoria_visible('contratos')), false), false,
  'categoria_visible: deactivated user (activo = false) resolves to false despite their role''s grant');

reset role;

-- 5: grant-table composite FK rejects a category not present in catalogo.
select throws_ok(
  $$insert into public.documento_categoria_permiso (rol_id, categoria)
    values ((select id from public.rol where nombre = 'Colaborador'), 'inexistente')$$,
  '23503', null,
  'documento_categoria_permiso rejects a category not present in catalogo (composite FK)');

-- 6: SELECT readable by any authenticated user (even colaborador, no admin
-- perms) -- the grant matrix is not secret.
set local role authenticated;
set local request.jwt.claims to '{"sub":"63636363-6363-6363-6363-636363636363"}';

select ok((select count(*) > 0 from public.documento_categoria_permiso
           where categoria = 'contratos'),
  'any authenticated user (colaborador, no admin perms) can SELECT the grant table');

-- 7-8: admin-only INSERT/DELETE -- non-admin denied.
select throws_ok(
  $$insert into public.documento_categoria_permiso (rol_id, categoria)
    values ((select id from public.rol where nombre = 'Colaborador'), 'legal')$$,
  '42501', null, 'colaborador cannot INSERT a grant (admin.editar required)');

select throws_ok(
  $$delete from public.documento_categoria_permiso
    where rol_id = (select id from public.rol where nombre = 'Coordinador') and categoria = 'contratos'$$,
  '42501', null, 'colaborador cannot DELETE a grant (admin.editar required)');

-- 9-10: administrador (admin.editar) CAN insert and delete grants.
set local request.jwt.claims to '{"sub":"61616161-6161-6161-6161-616161616161"}';

select lives_ok(
  $$insert into public.documento_categoria_permiso (rol_id, categoria)
    values ((select id from public.rol where nombre = 'Colaborador'), 'legal')$$,
  'administrador (admin.editar) can INSERT a grant');

select lives_ok(
  $$delete from public.documento_categoria_permiso
    where rol_id = (select id from public.rol where nombre = 'Colaborador') and categoria = 'legal'$$,
  'administrador (admin.editar) can DELETE a grant');

reset role;

-- 11: resolver reflects a revoked grant live (no caching) -- delete the
-- Coordinador/contratos grant and re-check as coordinador.
delete from public.documento_categoria_permiso
  where rol_id = (select id from public.rol where nombre = 'Coordinador') and categoria = 'contratos';

set local role authenticated;
set local request.jwt.claims to '{"sub":"62626262-6262-6262-6262-626262626262"}';
select is((select private.categoria_visible('contratos')), false,
  'categoria_visible resolves false immediately after the grant row is deleted (not cached)');
reset role;

-- 12: anon has no path to the resolver (no schema usage / no EXECUTE grant).
set local role anon;
select throws_ok(
  $$select private.categoria_visible('contratos')$$,
  '42501', null,
  'anon cannot execute private.categoria_visible (no schema usage / no EXECUTE grant)');
reset role;

-- 13-15: structural guarantees.
select col_is_pk('public', 'documento_categoria_permiso', array['rol_id', 'categoria'],
  'documento_categoria_permiso PK is (rol_id, categoria)');

select ok((select relrowsecurity and relforcerowsecurity from pg_class
           where relname = 'documento_categoria_permiso' and relnamespace = 'public'::regnamespace),
  'documento_categoria_permiso has RLS enabled AND forced');

select has_index('public', 'documento_categoria_permiso', 'doc_cat_permiso_categoria_idx',
  'index on documento_categoria_permiso(categoria) exists');

select * from finish();

rollback;
