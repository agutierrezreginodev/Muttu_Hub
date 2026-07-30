-- pgTAP: documento_version_rpc migration (documentos-repositorio PR2b) --
-- add_documento_version (monotonic, RPC-only write path) and
-- soft_delete_documento.
-- Source: sdd/documentos-repositorio/design, Decision 3; specs/document-
-- versioning, specs/document-library.
-- Builds on PR2a's documento/documento_version/RLS (documentos_repositorio_
-- rls.sql covers the table/RLS/view/CAT5 layer independently).

begin;

select plan(16);

-- Fixtures (superuser, bypasses RLS/grants entirely). Reuses the same role
-- UUID scheme as documentos_repositorio_rls.sql (isolated transaction, no
-- collision).
insert into auth.users (id, email) values
  ('73737373-7373-7373-7373-737373737373', 'admin-docrpc@test.local'),
  ('74747474-7474-7474-7474-747474747474', 'gerencia-docrpc@test.local'),
  ('75757575-7575-7575-7575-757575757575', 'coord-docrpc@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('73737373-7373-7373-7373-737373737373', 'Admin DocRpc', 'admin-docrpc@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('74747474-7474-7474-7474-747474747474', 'Gerencia DocRpc', 'gerencia-docrpc@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('75757575-7575-7575-7575-757575757575', 'Coordinador DocRpc', 'coord-docrpc@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'contratos', 'Contratos', 1),
  ('categoria_documento', 'legal', 'Legal', 2);

-- Administrador + Coordinador granted contratos only; legal stays ungranted
-- on purpose (isolates the category gate on both RPCs).
insert into public.documento_categoria_permiso (rol_id, categoria) values
  ((select id from public.rol where nombre = 'Administrador'), 'contratos'),
  ((select id from public.rol where nombre = 'Coordinador'), 'contratos');

insert into public.cliente (id, nombre, estado) overriding system value values
  (721, 'Cliente DocRpc Visible', 'activo'),
  (722, 'Cliente DocRpc Borrado', 'activo');
update public.cliente set deleted_at = now() where id = 722;

insert into public.documento (id, cliente_id, nombre, categoria) overriding system value values
  (950, 721, 'Doc Nueva Sin Version', 'contratos'),
  (951, 721, 'Doc Legal Para Version', 'legal'),
  (952, 722, 'Doc Cliente Borrado', 'contratos'),
  (953, 721, 'Doc Para Eliminar', 'contratos'),
  (954, 721, 'Doc Legal Para Eliminar', 'legal');

-- 1-3: add_documento_version -- monotonic numbering, first version starts at 1.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select lives_ok(
  $$select public.add_documento_version(950, '721/950/1/a.pdf', 'a.pdf', 100, 'application/pdf')$$,
  'coordinador (crear + grant on contratos) can add the first version of documento 950');

select is((select version from public.documento_version where documento_id = 950),
  1, 'first version added to a document with no prior versions is numbered 1');

select lives_ok(
  $$select public.add_documento_version(950, '721/950/2/b.pdf', 'b.pdf', 200, 'application/pdf')$$,
  'coordinador can add a second version to documento 950');

select is((select max(version) from public.documento_version where documento_id = 950),
  2, 'second call computes coalesce(max(version),0)+1 = 2, not a fixed constant');

select is((select uploaded_by from public.documento_version where documento_id = 950 and version = 1),
  '75757575-7575-7575-7575-757575757575'::uuid,
  'add_documento_version stamps uploaded_by from auth.uid(), no app code involved');

reset role;

-- 6-8: add_documento_version gates -- category, permission, cliente_visible.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select throws_ok(
  $$select public.add_documento_version(951, '721/951/1/c.pdf', 'c.pdf', 50, 'application/pdf')$$,
  '42501', null, 'add_documento_version denies a caller lacking the document''s category grant (legal)');

select throws_ok(
  $$select public.add_documento_version(952, '722/952/1/d.pdf', 'd.pdf', 50, 'application/pdf')$$,
  '42501', null, 'add_documento_version denies when the document''s cliente is not visible (soft-deleted)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"74747474-7474-7474-7474-747474747474"}';

select throws_ok(
  $$select public.add_documento_version(950, '721/950/3/e.pdf', 'e.pdf', 50, 'application/pdf')$$,
  '42501', null, 'add_documento_version denies gerencia (documentos.crear seeded false)');

reset role;

-- 9: add_documento_version -- nonexistent documento.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select throws_ok(
  $$select public.add_documento_version(999999, '0/999999/1/x.pdf', 'x.pdf', 1, 'application/pdf')$$,
  '42501', null, 'add_documento_version denies a nonexistent/invisible documento id');

reset role;

-- 10-13: soft_delete_documento -- permission gate, category gate, success, not-found.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select throws_ok(
  $$select public.soft_delete_documento(953)$$,
  '42501', null, 'coordinador (documentos.eliminar seeded false) cannot soft-delete documento');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"73737373-7373-7373-7373-737373737373"}';

select throws_ok(
  $$select public.soft_delete_documento(954)$$,
  '42501', null, 'administrador (eliminar=true) still cannot soft-delete a legal document without a legal grant');

select lives_ok(
  $$select public.soft_delete_documento(953)$$,
  'administrador (eliminar + grant on contratos) can soft-delete documento 953');

select throws_ok(
  $$select public.soft_delete_documento(999999)$$,
  '42501', null, 'soft_delete_documento denies a nonexistent/invisible documento id');

reset role;

select ok((select deleted_at is not null from public.documento where id = 953),
  'soft_delete_documento set deleted_at (superuser bypass check)');

-- 15-16: anon has no path to either RPC (no schema usage / no EXECUTE grant).
set local role anon;

select throws_ok(
  $$select public.add_documento_version(950, '721/950/9/z.pdf', 'z.pdf', 1, 'application/pdf')$$,
  '42501', null, 'anon cannot execute add_documento_version');

select throws_ok(
  $$select public.soft_delete_documento(950)$$,
  '42501', null, 'anon cannot execute soft_delete_documento');

reset role;

select * from finish();

rollback;
