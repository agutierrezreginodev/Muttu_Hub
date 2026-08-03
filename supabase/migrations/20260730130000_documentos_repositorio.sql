-- documentos_repositorio (documentos-repositorio PR2a): `documento` parent +
-- `documento_version` child tables, `v_documento` (derived current version),
-- their RLS/grants, and the CAT5 extension of `soft_delete_catalogo`.
-- Source: sdd/documentos-repositorio/design, Decisions 1/2/4; specs/document-
-- library, specs/document-versioning.
--
-- Split note (disclosed deviation from design.md's unsplit Migration Plan
-- #2): budget guard flagged this slice HIGH risk (~380 lines incl. test), so
-- it ships as PR2a (tables+RLS+view+CAT5) here + PR2b (the RPC write path,
-- `documento_version_rpc.sql`) next. `documento_version` gets SELECT-only
-- grant from THIS migration -- "RPC-write-only" (Decision 3) holds before
-- PR2b's RPC even exists.
--
-- categoria: NOT NULL FK to catalogo(tipo='categoria_documento') -- the
-- third, orthogonal axis (Decision 4) AND-composed with cliente_visible and
-- has_permission('documentos', verb). Decision 8: categoria_documento ships
-- EMPTY -- no document can exist until an admin adds + grants a code (PR1).

-- 1. documento: the metadata parent. unique(id, cliente_id) backs
--    documento_version's denormalized-cliente_id FK below (oportunidad's shape).
create table public.documento (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.cliente(id),
  nombre text not null,
  categoria text not null,
  categoria_cat_tipo text not null default 'categoria_documento'
    check (categoria_cat_tipo = 'categoria_documento'),
  descripcion text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz,
  constraint documento_categoria_fk foreign key (categoria_cat_tipo, categoria)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  constraint documento_id_cliente_uk unique (id, cliente_id)
);
create index documento_cliente_idx on public.documento(cliente_id) where deleted_at is null;

create trigger documento_audit_fields
  before insert or update on public.documento
  for each row execute function private.audit_fields();

-- 2. documento_version: RPC-write-only (Decision 3). Denormalized cliente_id
--    is an RLS input, anti-drift via the composite FK. storage_path is
--    UNIQUE (one version = one Storage object, never reused).
create table public.documento_version (
  id bigint generated always as identity primary key,
  documento_id bigint not null,
  cliente_id bigint not null,
  version integer not null,
  storage_bucket text not null default 'documentos',
  storage_path text not null unique,
  original_filename text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  uploaded_by uuid references public.usuario(id),
  created_at timestamptz not null default now(),
  unique (documento_id, version),
  constraint documento_version_documento_fk
    foreign key (documento_id, cliente_id)
    references public.documento (id, cliente_id) on delete restrict
);
create index documento_version_documento_idx on public.documento_version(documento_id);
create index documento_version_cliente_idx on public.documento_version(cliente_id);

-- 3. RLS enabled + FORCED on both tables.
alter table public.documento enable row level security;
alter table public.documento force row level security;
alter table public.documento_version enable row level security;
alter table public.documento_version force row level security;

-- 4. Grants. documento: SELECT/INSERT + column-scoped UPDATE excluding the
--    discriminator/audit/deleted_at (tamper-proofing). documento_version:
--    SELECT only -- no write grant at all (Decision 3); PR2b's RPC writes it.
revoke all on public.documento from anon, authenticated;
grant select, insert on public.documento to authenticated;
grant update (cliente_id, nombre, categoria, descripcion, tags)
  on public.documento to authenticated;
grant select, insert on public.documento to service_role;
grant update (cliente_id, nombre, categoria, descripcion, tags)
  on public.documento to service_role;

revoke all on public.documento_version from anon, authenticated;
grant select on public.documento_version to authenticated;
grant select on public.documento_version to service_role;

-- 5. Policies. documento: 3 orthogonal axes AND-composed -- cliente_visible
--    AND has_permission('documentos', verb) AND categoria_visible. UPDATE
--    gates BOTH old (USING) and new (WITH CHECK) row on categoria_visible, so
--    recategorizing into an ungranted category is rejected.
--    documento_version: SELECT derives from the parent (Decision 3/5) -- the
--    exact predicate PR3's storage.objects SELECT policy delegates to.
create policy documento_select on public.documento
  for select to authenticated
  using (
    deleted_at is null
    and (select private.cliente_visible(cliente_id))
    and (select private.has_permission('documentos', 'ver'))
    and (select private.categoria_visible(categoria))
  );
create policy documento_insert on public.documento
  for insert to authenticated
  with check (
    (select private.cliente_visible(cliente_id))
    and (select private.has_permission('documentos', 'crear'))
    and (select private.categoria_visible(categoria))
  );
create policy documento_update on public.documento
  for update to authenticated
  using (
    deleted_at is null
    and (select private.cliente_visible(cliente_id))
    and (select private.has_permission('documentos', 'editar'))
    and (select private.categoria_visible(categoria))
  )
  with check (
    deleted_at is null
    and (select private.cliente_visible(cliente_id))
    and (select private.has_permission('documentos', 'editar'))
    and (select private.categoria_visible(categoria))
  );

create policy documento_version_select on public.documento_version
  for select to authenticated
  using (
    exists (
      select 1 from public.documento d
      where d.id = documento_id
        and d.deleted_at is null
        and (select private.cliente_visible(d.cliente_id))
        and (select private.has_permission('documentos', 'ver'))
        and (select private.categoria_visible(d.categoria))
    )
  );

-- 6. v_documento: parent metadata + CURRENT version's attributes (Decision 2:
--    derived via lateral join, no current_version_id column, no circular
--    FK). security_invoker so it never bypasses the policies above.
create view public.v_documento
with (security_invoker = true) as
  select d.id, d.cliente_id, d.nombre, d.categoria, d.descripcion, d.tags,
         cur.version as current_version, cur.size_bytes, cur.mime_type,
         cur.original_filename, cur.uploaded_by, cur.created_at as current_uploaded_at,
         d.created_at, d.created_by, d.updated_at, d.updated_by
  from public.documento d
  left join lateral (
    select * from public.documento_version dv
    where dv.documento_id = d.id
    order by dv.version desc limit 1
  ) cur on true
  where d.deleted_at is null;

revoke all on public.v_documento from anon, authenticated;
grant select on public.v_documento to authenticated;

-- 7. Extend soft_delete_catalogo's CAT5 guard to documento.categoria: a
--    non-deleted documento referencing a code blocks its deactivation.
create or replace function private.soft_delete_catalogo(p_tipo text, p_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('admin', 'eliminar')) then
    raise exception 'permission denied: admin.eliminar required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cliente
    where deleted_at is null
      and ((tipo_cliente_cat_tipo = p_tipo and tipo_cliente = p_codigo)
        or (estado_cat_tipo = p_tipo and estado = p_codigo)
        or (tamano_organizacion_cat_tipo = p_tipo and tamano_organizacion = p_codigo)
        or (canal_contacto_inicial_cat_tipo = p_tipo and canal_contacto_inicial = p_codigo)
        or (prioridad_cat_tipo = p_tipo and prioridad = p_codigo)
        or (nivel_madurez_cat_tipo = p_tipo and nivel_madurez = p_codigo))
  ) or exists (
    select 1 from public.tarea
    where deleted_at is null
      and prioridad_cat_tipo = p_tipo and prioridad = p_codigo
  ) or exists (
    select 1 from public.contacto
    where deleted_at is null
      and perfil_decision_cat_tipo = p_tipo and perfil_decision = p_codigo
  ) or exists (
    select 1 from public.oportunidad
    where deleted_at is null
      and estado_cat_tipo = p_tipo and estado = p_codigo
  ) or exists (
    select 1 from public.oportunidad_servicio os
    join public.oportunidad o on o.id = os.oportunidad_id
    where o.deleted_at is null
      and os.servicio_cat_tipo = p_tipo and os.servicio_codigo = p_codigo
  ) or exists (
    select 1 from public.documento
    where deleted_at is null
      and categoria_cat_tipo = p_tipo and categoria = p_codigo
  ) then
    raise exception 'catalogo code in use: cannot deactivate %/%', p_tipo, p_codigo
      using errcode = '23503';
  end if;

  update public.catalogo set activo = false
  where tipo = p_tipo and codigo = p_codigo;
end;
$$;
