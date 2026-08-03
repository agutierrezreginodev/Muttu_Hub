-- pgTAP: documentos_storage migration (documentos-repositorio PR3) --
-- bucket `documentos` (private) + storage.objects SELECT/INSERT policies.
-- Source: sdd/documentos-repositorio/design, Decision 5; specs/document-
-- permissions ("Storage layer inherits the metadata gate"); specs/document-
-- zip-export ("RLS-gated per-object reads").
--
-- The load-bearing assertion here is the SELECT delegation: storage.objects
-- has NO idea what "category" means -- its SELECT policy only knows how to
-- ask documento_version "would you show this path to this caller?" via
-- EXISTS. A category-denied role and an orphan object (no documento_version
-- row at all) must both be invisible through the exact same mechanism.
-- INSERT cannot delegate this way (the version row does not exist yet), so
-- it gates only on cliente scope + documentos.crear (Decision 5); category
-- is enforced one layer up by add_documento_version (PR2b).

begin;

select plan(13);

-- Fixtures (superuser, bypasses RLS/grants entirely). Reuses the role UUID
-- scheme established by documentos_repositorio_rls.sql / documento_version_
-- rpc_rls.sql (isolated transaction, no collision).
insert into auth.users (id, email) values
  ('81818181-8181-8181-8181-818181818181', 'gerencia-docstorage@test.local'),
  ('82828282-8282-8282-8282-828282828282', 'coord-docstorage@test.local'),
  ('83838383-8383-8383-8383-838383838383', 'colab-docstorage@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('81818181-8181-8181-8181-818181818181', 'Gerencia DocStorage', 'gerencia-docstorage@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('82828282-8282-8282-8282-828282828282', 'Coordinador DocStorage', 'coord-docstorage@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('83838383-8383-8383-8383-838383838383', 'Colaborador DocStorage', 'colab-docstorage@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'contratos', 'Contratos', 1),
  ('categoria_documento', 'legal', 'Legal', 2);

-- Coordinador granted contratos only; legal stays ungranted on purpose
-- (isolates the category axis at the storage layer). Gerencia gets NO
-- category grant at all -- proves documentos.ver true is still not enough.
insert into public.documento_categoria_permiso (rol_id, categoria) values
  ((select id from public.rol where nombre = 'Coordinador'), 'contratos');

insert into public.cliente (id, nombre, estado) overriding system value values
  (740, 'Cliente DocStorage Visible', 'activo'),
  (741, 'Cliente DocStorage Borrado', 'activo');
update public.cliente set deleted_at = now() where id = 741;

insert into public.documento (id, cliente_id, nombre, categoria) overriding system value values
  (970, 740, 'Doc Contratos Storage', 'contratos'),
  (971, 740, 'Doc Legal Storage', 'legal');

insert into public.documento_version
  (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type, uploaded_by)
values
  (970, 740, 1, '740/970/1/contrato.pdf', 'contrato.pdf', 1024, 'application/pdf',
   '82828282-8282-8282-8282-828282828282'),
  (971, 740, 1, '740/971/1/legal.pdf', 'legal.pdf', 512, 'application/pdf',
   '82828282-8282-8282-8282-828282828282');

-- Actual bytes (superuser insert -- storage.objects/storage.buckets RLS is
-- platform-managed, bypassed here same as every other fixture insert in this
-- suite). The third object is a deliberate orphan: no documento_version row
-- references its path.
insert into storage.objects (bucket_id, name) values
  ('documentos', '740/970/1/contrato.pdf'),
  ('documentos', '740/971/1/legal.pdf'),
  ('documentos', '740/999/1/orphan.pdf');

-- 1-2: bucket exists and is private.
select ok((select count(*) = 1 from storage.buckets where id = 'documentos'),
  'bucket documentos exists');

select is((select public from storage.buckets where id = 'documentos'), false,
  'bucket documentos is private (public = false)');

-- 3-7: storage.objects SELECT -- EXISTS-delegation to documento_version RLS.
set local role authenticated;
set local request.jwt.claims to '{"sub":"82828282-8282-8282-8282-828282828282"}';

select ok((select count(*) = 1 from storage.objects
           where bucket_id = 'documentos' and name = '740/970/1/contrato.pdf'),
  'coordinador (ver + grant on contratos) can SELECT the object for a visible version');

select ok((select count(*) = 0 from storage.objects
           where bucket_id = 'documentos' and name = '740/971/1/legal.pdf'),
  'coordinador cannot SELECT the object for a version in an ungranted category (legal)');

select ok((select count(*) = 0 from storage.objects
           where bucket_id = 'documentos' and name = '740/999/1/orphan.pdf'),
  'orphan object with no documento_version row is invisible even to an otherwise-authorized role');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"83838383-8383-8383-8383-838383838383"}';

select ok((select count(*) = 0 from storage.objects
           where bucket_id = 'documentos' and name = '740/970/1/contrato.pdf'),
  'colaborador (documentos.ver seeded false) sees zero storage objects regardless of category');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"81818181-8181-8181-8181-818181818181"}';

select ok((select count(*) = 0 from storage.objects
           where bucket_id = 'documentos' and name = '740/970/1/contrato.pdf'),
  'gerencia (documentos.ver true) still cannot SELECT without a category grant on contratos');

reset role;

-- 8-10: storage.objects INSERT -- cliente_visible + documentos.crear only
-- (category is not, and cannot be, checked here -- Decision 5).
set local role authenticated;
set local request.jwt.claims to '{"sub":"82828282-8282-8282-8282-828282828282"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('documentos', '740/970/2/contrato_v2.pdf')$$,
  'coordinador (crear + cliente_visible(740)) can INSERT an object under a visible cliente folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('documentos', '741/999/1/x.pdf')$$,
  '42501', null,
  'coordinador cannot INSERT under a cliente folder that is not visible (cliente 741 soft-deleted)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"81818181-8181-8181-8181-818181818181"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('documentos', '740/999/1/y.pdf')$$,
  '42501', null,
  'gerencia cannot INSERT (documentos.crear seeded false), even under a visible cliente folder');

reset role;

-- 11-13: no UPDATE/DELETE policy for authenticated on this bucket -- bytes
-- are immutable once written (structural check + live no-op confirmation,
-- mirroring how this suite treats missing-policy vs missing-grant elsewhere).
select ok((select count(*) = 0 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('UPDATE', 'DELETE') and 'authenticated' = any(roles)),
  'storage.objects has no UPDATE or DELETE policy scoped to authenticated');

set local role authenticated;
set local request.jwt.claims to '{"sub":"82828282-8282-8282-8282-828282828282"}';

with u as (
  update storage.objects set name = '740/970/1/renamed.pdf'
  where bucket_id = 'documentos' and name = '740/970/1/contrato.pdf'
  returning 1
)
select ok((select count(*) = 0 from u),
  'coordinador cannot UPDATE a storage object it can otherwise SELECT (no UPDATE policy)');

-- Supabase now installs storage.protect_delete() as a BEFORE-DELETE trigger
-- on storage.objects that RAISEs unconditionally before any policy/grant
-- evaluation. The previous writable-CTE-count=0 assertion ("no DELETE
-- policy -> 0 rows") is unreachable because the trigger fires first and
-- interrupts the CTE mid-statement. throws_ok matches the trigger's stable
-- RAISE message substring without brittle SQLSTATE coupling (the message
-- is a fixed string, not a parameterised error, so it is stable across
-- Supabase versions).
select throws_ok(
  $$delete from storage.objects where bucket_id = 'documentos' and name = '740/970/1/contrato.pdf'$$,
  'Direct deletion from storage tables is not allowed',
  'coordinador cannot directly DELETE a storage object (storage.protect_delete() trigger blocks all direct deletes)');

reset role;

select * from finish();

rollback;
