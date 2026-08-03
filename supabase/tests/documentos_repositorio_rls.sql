-- pgTAP: documentos_repositorio migration (documentos-repositorio PR2a) --
-- documento, documento_version, v_documento, extended soft_delete_catalogo.
-- Source: sdd/documentos-repositorio/design, Decisions 1/2/3/4/5;
-- specs/document-library, specs/document-versioning.
-- Scope: PR2a only (tables + RLS + view + CAT5). RPCs (add_documento_version,
-- soft_delete_documento) are covered by documento_version_rpc_rls.sql (PR2b);
-- version fixtures below are inserted directly (superuser bypass), same as
-- PR1's grant-table fixtures. categoria_documento codes are test-local rows
-- (Decision 8 keeps the real catalog empty).

begin;

select plan(34);

-- Fixtures (superuser, bypasses RLS/grants entirely).
insert into auth.users (id, email) values
  ('73737373-7373-7373-7373-737373737373', 'admin-docrepo@test.local'),
  ('74747474-7474-7474-7474-747474747474', 'gerencia-docrepo@test.local'),
  ('75757575-7575-7575-7575-757575757575', 'coord-docrepo@test.local'),
  ('76767676-7676-7676-7676-767676767676', 'colab-docrepo@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('73737373-7373-7373-7373-737373737373', 'Admin DocRepo', 'admin-docrepo@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('74747474-7474-7474-7474-747474747474', 'Gerencia DocRepo', 'gerencia-docrepo@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('75757575-7575-7575-7575-757575757575', 'Coordinador DocRepo', 'coord-docrepo@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('76767676-7676-7676-7676-767676767676', 'Colaborador DocRepo', 'colab-docrepo@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'contratos', 'Contratos', 1),
  ('categoria_documento', 'legal', 'Legal', 2),
  ('categoria_documento', 'interno', 'Interno', 3),
  ('categoria_documento', 'temporal', 'Temporal', 4);

-- Category grants (PR1's table): gerencia + coordinador -> contratos;
-- coordinador also -> interno. legal/temporal stay ungranted on purpose.
insert into public.documento_categoria_permiso (rol_id, categoria) values
  ((select id from public.rol where nombre = 'Gerencia'), 'contratos'),
  ((select id from public.rol where nombre = 'Coordinador'), 'contratos'),
  ((select id from public.rol where nombre = 'Coordinador'), 'interno');

insert into public.cliente (id, nombre, estado) overriding system value values
  (711, 'Cliente DocRepo Visible', 'activo'),
  (712, 'Cliente DocRepo Borrado', 'activo');
update public.cliente set deleted_at = now() where id = 712;

insert into public.documento (id, cliente_id, nombre, categoria) overriding system value values
  (850, 711, 'Doc Contratos', 'contratos'),
  (851, 711, 'Doc Legal', 'legal'),
  (852, 712, 'Doc Cliente Borrado', 'contratos'),
  (853, 711, 'Doc Para Recategorizar', 'contratos'),
  (854, 711, 'Doc Con Versiones', 'contratos'),
  (855, 711, 'Doc Legal Con Version', 'legal');

insert into public.documento_version
  (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type, uploaded_by)
values
  (854, 711, 1, '711/854/1/contrato_v1.pdf', 'contrato_v1.pdf', 1024, 'application/pdf',
   '75757575-7575-7575-7575-757575757575'),
  (854, 711, 2, '711/854/2/contrato_v2.pdf', 'contrato_v2.pdf', 2048, 'application/pdf',
   '75757575-7575-7575-7575-757575757575'),
  (854, 711, 3, '711/854/3/contrato_v3.pdf', 'contrato_v3.pdf', 4096, 'application/pdf',
   '75757575-7575-7575-7575-757575757575'),
  (855, 711, 1, '711/855/1/legal_v1.pdf', 'legal_v1.pdf', 512, 'application/pdf',
   '75757575-7575-7575-7575-757575757575');

-- 1-5: documento SELECT -- 3-axis matrix (cliente_visible x documentos.ver x categoria_visible).
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select ok((select count(*) = 1 from public.documento where id = 850),
  'coordinador (ver + grant on contratos) can SELECT a contratos document');

select ok((select count(*) = 0 from public.documento where id = 851),
  'coordinador cannot SELECT the legal document (no grant on legal, fail-closed)');

select ok((select count(*) = 0 from public.documento where id = 852),
  'coordinador cannot SELECT a document tied to a soft-deleted cliente (cliente_visible false)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"76767676-7676-7676-7676-767676767676"}';

select ok((select count(*) = 0 from public.documento where id = 850),
  'colaborador (documentos.ver seeded false) sees zero documents');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"73737373-7373-7373-7373-737373737373"}';

select ok((select count(*) = 0 from public.documento where id = 850),
  'administrador (documentos.ver true) still sees zero without a category grant (Decision 4: separate axis)');

reset role;

-- 6-11: documento INSERT.
set local role authenticated;
set local request.jwt.claims to '{"sub":"74747474-7474-7474-7474-747474747474"}';

select throws_ok(
  $$insert into public.documento (cliente_id, nombre, categoria) values (711, 'Intruso', 'contratos')$$,
  '42501', null, 'gerencia cannot INSERT documento (documentos.crear required)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select lives_ok(
  $$insert into public.documento (cliente_id, nombre, categoria) values (711, 'Nuevo Contrato', 'contratos')$$,
  'coordinador (crear + grant on contratos) can INSERT into a visible cliente');

select throws_ok(
  $$insert into public.documento (cliente_id, nombre, categoria) values (711, 'Nuevo Legal', 'legal')$$,
  '42501', null, 'coordinador cannot INSERT into an ungranted category (legal)');

select throws_ok(
  $$insert into public.documento (cliente_id, nombre, categoria) values (712, 'Doc Cliente Invisible', 'contratos')$$,
  '42501', null, 'coordinador cannot INSERT for a cliente they cannot see (soft-deleted)');

reset role;

-- Superuser bypass: under RLS the WITH CHECK would raise 42501 first and
-- mask the NOT NULL constraint. Bypassing isolates the constraint itself,
-- same pattern as the FK test below.
select throws_ok(
  $$insert into public.documento (cliente_id, nombre) values (711, 'Sin Categoria')$$,
  '23502', null, 'documento.categoria is NOT NULL -- omitting it rejects the insert');

-- Superuser bypass: an unlisted category can never hold a grant either (its
-- own FK requires the code to exist), so under RLS this would show 42501
-- first and mask the FK. Bypassing isolates the FK mechanism itself.
select throws_ok(
  $$insert into public.documento (cliente_id, nombre, categoria) values (711, 'Cat Invalida', 'inexistente')$$,
  '23503', null, 'documento.categoria composite FK rejects an unlisted category code');

-- 12-16: documento UPDATE -- rename, recategorize (old+new gate), tamper-proofing, no DELETE grant.
set local role authenticated;
set local request.jwt.claims to '{"sub":"74747474-7474-7474-7474-747474747474"}';

with u as (update public.documento set descripcion = 'x' where id = 850 returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE documento (documentos.editar required)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

with u as (
  update public.documento set nombre = 'Doc Renombrado' where id = 853 returning updated_by
)
select is((select updated_by from u), '75757575-7575-7575-7575-757575757575'::uuid,
  'coordinador can rename documento (documentos.editar); audit_fields() sets updated_by');

select throws_ok(
  $$update public.documento set categoria = 'legal' where id = 853$$,
  '42501', null, 'recategorize into an ungranted category (legal) is blocked (WITH CHECK fails on the new row)');

select lives_ok(
  $$update public.documento set categoria = 'interno' where id = 853$$,
  'recategorize into a granted category (interno) succeeds (both old and new pass categoria_visible)');

select is((select categoria from public.documento where id = 853), 'interno',
  'documento 853 categoria is now interno after the successful recategorize');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"73737373-7373-7373-7373-737373737373"}';

select throws_ok(
  $$update public.documento set categoria_cat_tipo = 'bogus' where id = 850$$,
  '42501', null, 'documento.categoria_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

select throws_ok(
  $$delete from public.documento where id = 850$$,
  '42501', null, 'no DELETE grant on documento for authenticated (grant layer, any role)');

reset role;

-- 17-21: documento_version -- SELECT derives from parent, no direct write grant at all.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select ok((select count(*) = 3 from public.documento_version where documento_id = 854),
  'coordinador sees all 3 versions of a visible, granted-category documento');

select ok((select count(*) = 0 from public.documento_version where documento_id = 855),
  'coordinador sees zero versions of a documento in an ungranted category (visibility follows the parent)');

select throws_ok(
  $$insert into public.documento_version
      (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type)
    values (854, 711, 4, '711/854/4/x.pdf', 'x.pdf', 10, 'application/pdf')$$,
  '42501', null, 'authenticated cannot directly INSERT into documento_version (RPC-only write path)');

select throws_ok(
  $$update public.documento_version set mime_type = 'text/plain' where documento_id = 854 and version = 1$$,
  '42501', null, 'authenticated cannot directly UPDATE documento_version');

select throws_ok(
  $$delete from public.documento_version where documento_id = 854 and version = 1$$,
  '42501', null, 'authenticated cannot directly DELETE from documento_version');

reset role;

-- 22-23: structural constraints (superuser bypass -- pure constraint tests, not RLS).
select throws_ok(
  $$insert into public.documento_version
      (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type)
    values (854, 712, 5, '712/854/5/drift.pdf', 'drift.pdf', 10, 'application/pdf')$$,
  '23503', null, 'documento_version.cliente_id cannot drift from its documento''s real cliente_id (composite FK)');

select throws_ok(
  $$insert into public.documento_version
      (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type)
    values (854, 711, 3, '711/854/3/dup.pdf', 'dup.pdf', 10, 'application/pdf')$$,
  '23505', null, 'unique(documento_id, version) rejects a duplicate version number');

-- 24-25: v_documento -- derived current version + security_invoker.
set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select is((select current_version::text || ':' || original_filename
           from public.v_documento where id = 854),
  '3:contrato_v3.pdf', 'v_documento reports version 3''s number and filename as current');

reset role;

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_documento' and relnamespace = 'public'::regnamespace),
  'v_documento is a security_invoker view');

-- 26-27: soft-deleting the parent hides its versions without touching them (visibility follow).
update public.documento set deleted_at = now() where id = 854;

set local role authenticated;
set local request.jwt.claims to '{"sub":"75757575-7575-7575-7575-757575757575"}';

select ok((select count(*) = 0 from public.documento_version where documento_id = 854),
  'documento_version rows for 854 become invisible once the parent is soft-deleted');

reset role;

select ok((select count(*) = 3 from public.documento_version where documento_id = 854),
  'documento_version rows for 854 were never touched by the parent soft-delete (superuser bypass check)');

-- 28-29: CAT5 guard extended to documento.categoria.
set local role authenticated;
set local request.jwt.claims to '{"sub":"73737373-7373-7373-7373-737373737373"}';

select throws_ok(
  $$select public.soft_delete_catalogo('categoria_documento', 'interno')$$,
  '23503', null, 'soft_delete_catalogo guard extended: rejects deactivating a categoria_documento code in use by documento 853');

select lives_ok(
  $$select public.soft_delete_catalogo('categoria_documento', 'temporal')$$,
  'soft_delete_catalogo succeeds deactivating a categoria_documento code no document references');

reset role;

-- 30-32: structural guarantees.
select ok((select count(*) = 1 from pg_constraint
           where conname = 'documento_id_cliente_uk' and conrelid = 'public.documento'::regclass),
  'documento_id_cliente_uk unique(id,cliente_id) constraint exists (backs the version composite FK)');

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
           where relname in ('documento', 'documento_version') and relnamespace = 'public'::regnamespace),
  'documento and documento_version both have RLS enabled AND forced');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'documento_version'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'documento_version has no INSERT/UPDATE/DELETE grant for authenticated at all');

select * from finish();

rollback;
