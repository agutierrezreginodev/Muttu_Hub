-- documentos_storage (documentos-repositorio PR3): storage bucket
-- `documentos` (private) + storage.objects SELECT/INSERT policies.
-- Source: sdd/documentos-repositorio/design, Decision 5; specs/document-
-- permissions ("Storage layer inherits the metadata gate"); specs/document-
-- zip-export ("RLS-gated per-object reads").
--
-- Path convention: {cliente_id}/{documento_id}/{version}/{filename}, with
-- cliente_id first so (storage.foldername(name))[1] feeds the INSERT
-- policy directly.
--
-- Load-bearing trick (Decision 5): the SELECT policy does not know what a
-- "category" is. It delegates entirely to documento_version's own RLS via
-- EXISTS -- that policy already composes cliente_visible AND
-- has_permission('documentos','ver') AND categoria_visible(categoria). The
-- byte layer inherits the FULL 3-axis gate without category ever appearing
-- in the object path or in this policy's predicate. Orphan bytes with no
-- documento_version row are invisible to every caller (the EXISTS matches
-- nothing).
--
-- INSERT cannot delegate the same way -- the version row does not exist yet
-- at upload time -- so it gates only on cliente scope + the module-level
-- crear verb. Category is enforced one layer up, at add_documento_version
-- (PR2b), before the metadata row (and thus visibility) exists.
--
-- No UPDATE/DELETE policy is granted to authenticated on this bucket:
-- versions are immutable once written (Decision 1/3), so there is no
-- authenticated-facing path to overwrite or remove bytes directly. RLS on
-- storage.objects/storage.buckets is enabled by the platform itself; this
-- migration only inserts the bucket row and adds policies, same posture as
-- every other Supabase Storage integration.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy documento_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.documento_version dv where dv.storage_path = name
    )
  );

create policy documento_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (select private.cliente_visible(((storage.foldername(name))[1])::bigint))
    and (select private.has_permission('documentos', 'crear'))
  );
