-- documento_version_rpc (documentos-repositorio PR2b, task 2.4's RPC half):
-- `add_documento_version` (monotonic, RPC-only version write path) and
-- `soft_delete_documento`, both private + public wrapper, mirroring
-- `set_oportunidad_servicios` / `soft_delete_contacto`.
-- Source: sdd/documentos-repositorio/design, Decision 3; specs/document-
-- versioning ("Monotonic version numbering via RPC-only write path");
-- specs/document-library ("Soft-delete a document").
--
-- Split note: this is PR2b, completing PR2a's (`documentos_repositorio.sql`)
-- table/RLS/view/CAT5 foundation with the write path. Both RPCs share the
-- same lookup shape: resolve (cliente_id, categoria) from the not-yet-deleted
-- documento row, then assert cliente_visible + has_permission('documentos',
-- verb) + categoria_visible(categoria) before writing -- exactly the 3-axis
-- gate PR2a's own RLS policies enforce, re-asserted here because these
-- functions run SECURITY DEFINER (bypassing the base-table grants/RLS
-- entirely, by design -- documento_version has no write grant for anyone).

-- ---------------------------------------------------------------------------
-- 1. add_documento_version: computes coalesce(max(version),0)+1 server-side.
--    "documento not found or not visible" covers both a nonexistent id and a
--    soft-deleted one with a single not-found branch (set_oportunidad_
--    servicios' pattern).
-- ---------------------------------------------------------------------------
create or replace function private.add_documento_version(
  p_documento_id bigint,
  p_storage_path text,
  p_original_filename text,
  p_size_bytes bigint,
  p_mime_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id bigint;
  v_categoria text;
  v_next_version integer;
begin
  select cliente_id, categoria into v_cliente_id, v_categoria
    from public.documento where id = p_documento_id and deleted_at is null;
  if not found then
    raise exception 'permission denied: documento not found or not visible' using errcode = '42501';
  end if;

  if not ((select private.cliente_visible(v_cliente_id))
          and (select private.has_permission('documentos', 'crear'))
          and (select private.categoria_visible(v_categoria))) then
    raise exception 'permission denied: documentos.crear required' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.documento_version where documento_id = p_documento_id;

  insert into public.documento_version
    (documento_id, cliente_id, version, storage_path, original_filename, size_bytes, mime_type, uploaded_by)
  values
    (p_documento_id, v_cliente_id, v_next_version, p_storage_path, p_original_filename,
     p_size_bytes, p_mime_type, (select auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. soft_delete_documento: same 3-axis gate, then sets deleted_at. Row
--    visibility (documento_version's SELECT policy) already follows the
--    parent via deleted_at is null -- no separate version cleanup needed.
-- ---------------------------------------------------------------------------
create or replace function private.soft_delete_documento(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id bigint;
  v_categoria text;
begin
  select cliente_id, categoria into v_cliente_id, v_categoria
    from public.documento where id = p_id and deleted_at is null;
  if not found then
    raise exception 'permission denied: documento not found or not visible' using errcode = '42501';
  end if;

  if not ((select private.cliente_visible(v_cliente_id))
          and (select private.has_permission('documentos', 'eliminar'))
          and (select private.categoria_visible(v_categoria))) then
    raise exception 'permission denied: documentos.eliminar required' using errcode = '42501';
  end if;

  update public.documento set deleted_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Public invoker wrappers (only entry point reachable through PostgREST's
--    exposed schema) + EXECUTE grants, mirroring every other RPC pair.
-- ---------------------------------------------------------------------------
create or replace function public.add_documento_version(
  p_documento_id bigint,
  p_storage_path text,
  p_original_filename text,
  p_size_bytes bigint,
  p_mime_type text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.add_documento_version(
    p_documento_id, p_storage_path, p_original_filename, p_size_bytes, p_mime_type);
$$;

create or replace function public.soft_delete_documento(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_documento(p_id);
$$;

revoke all on function private.add_documento_version(bigint, text, text, bigint, text) from public, anon;
revoke all on function private.soft_delete_documento(bigint) from public, anon;
grant execute on function private.add_documento_version(bigint, text, text, bigint, text) to authenticated;
grant execute on function private.soft_delete_documento(bigint) to authenticated;

revoke all on function public.add_documento_version(bigint, text, text, bigint, text) from public, anon;
revoke all on function public.soft_delete_documento(bigint) from public, anon;
grant execute on function public.add_documento_version(bigint, text, text, bigint, text) to authenticated;
grant execute on function public.soft_delete_documento(bigint) to authenticated;
