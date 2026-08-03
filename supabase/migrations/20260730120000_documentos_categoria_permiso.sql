-- documentos_categoria_permiso (documentos-repositorio PR1, tasks 1.1-1.2):
-- documento_categoria_permiso grant table + private.categoria_visible(text)
-- resolver -- the category-permission foundation the rest of this change's
-- `documento` RLS composes against.
-- Source: sdd/documentos-repositorio/design, Decision 4; sdd/documentos-
-- repositorio/specs/document-permissions/spec.md.
--
-- Decision 4: the 5x5 permisos jsonb grid (`documentos` module already
-- present, sdd/platform-foundation) is a FIXED, CHECK-constrained shape and
-- cannot carry dynamic, catalog-backed categories. Category access is
-- therefore a SEPARATE axis: a role-level grant table resolved by
-- private.categoria_visible, structured exactly like private.has_permission
-- (STABLE, SECURITY DEFINER, search_path pinned, EXECUTE restricted to
-- authenticated). Role-level only in this change -- usuario.permisos_override
-- is not extended for categories (spec: "Category access SHALL be role-level
-- only in this change").
--
-- Decision 8 (mirrors tipo_cliente in crm_catalogos PR1): the
-- categoria_documento catalog ships EMPTY. No categoria_documento code is
-- inserted by this migration -- business-approved codes are a product
-- decision this change has no authority to invent; a later PR in this same
-- change adds the admin editor where real codes get added. The composite FK
-- is MATCH SIMPLE (default), so this is schema-safe: with zero codes seeded,
-- any grant referencing one is rejected until the admin adds a code -- the
-- intended fail-closed behavior, not a defect.

-- ---------------------------------------------------------------------------
-- 1. documento_categoria_permiso: role x category grant. Absence of a row =
--    no access (fail-closed). PK (rol_id, categoria) -- a role either holds
--    the grant or it doesn't, no duplicate rows. Pinned-discriminator +
--    composite FK to catalogo(tipo, codigo), the exact mechanism
--    crm_catalogos established for tipo_cliente/estado/prioridad.
-- ---------------------------------------------------------------------------
create table public.documento_categoria_permiso (
  rol_id bigint not null references public.rol(id),
  categoria text not null,
  categoria_cat_tipo text not null default 'categoria_documento'
    check (categoria_cat_tipo = 'categoria_documento'),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  primary key (rol_id, categoria),
  constraint doc_cat_permiso_categoria_fk
    foreign key (categoria_cat_tipo, categoria)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict
);
create index doc_cat_permiso_categoria_idx on public.documento_categoria_permiso(categoria);

-- ---------------------------------------------------------------------------
-- 2. RLS + grants. Readable by any authenticated user (mirrors catalogo:
--    permission grants are not secret, and the admin grant editor, a later
--    PR in this same change, needs to read the current matrix); writes
--    (INSERT to grant, DELETE to revoke -- there is no UPDATE path, a grant
--    either exists or it doesn't) gated on admin.editar, mirroring how
--    catalogo/rol writes are gated. This is the first table in this codebase
--    where authenticated gets a DELETE grant: the "authenticated never gets
--    DELETE" invariant applies to domain tables with soft-delete semantics --
--    a permission GRANT has no such concept; revoking one is a literal,
--    intended row delete, not a lifecycle event that needs recovery.
-- ---------------------------------------------------------------------------
alter table public.documento_categoria_permiso enable row level security;
alter table public.documento_categoria_permiso force row level security;

revoke all on public.documento_categoria_permiso from anon, authenticated;
grant select, insert, delete on public.documento_categoria_permiso to authenticated;
grant select on public.documento_categoria_permiso to service_role;

create policy doc_cat_permiso_select on public.documento_categoria_permiso
  for select to authenticated using (true);
create policy doc_cat_permiso_insert on public.documento_categoria_permiso
  for insert to authenticated
  with check ((select private.has_permission('admin', 'editar')));
create policy doc_cat_permiso_delete on public.documento_categoria_permiso
  for delete to authenticated
  using ((select private.has_permission('admin', 'editar')));

-- ---------------------------------------------------------------------------
-- 3. private.categoria_visible(): the category-access resolver. Same shape
--    as private.has_permission (STABLE, SECURITY DEFINER, search_path
--    pinned): true iff the current user ((select auth.uid()), active, not
--    deleted) holds a documento_categoria_permiso row for p_categoria via
--    their role. No public wrapper -- like private.cliente_visible, only RLS
--    policies call this. No rol.activo join (unlike has_permission): the
--    design's own DDL sketch and the spec's Requirement text gate only on
--    the USER's activo/deleted_at, not the role's.
-- ---------------------------------------------------------------------------
create or replace function private.categoria_visible(p_categoria text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario u
    join public.documento_categoria_permiso p on p.rol_id = u.rol_id
    where u.id = (select auth.uid())
      and u.activo and u.deleted_at is null
      and p.categoria = p_categoria
  );
$$;

revoke all on function private.categoria_visible(text) from public, anon;
grant execute on function private.categoria_visible(text) to authenticated;
