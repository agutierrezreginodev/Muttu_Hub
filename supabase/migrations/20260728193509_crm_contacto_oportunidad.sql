-- crm_contacto_oportunidad (crm-module PR3, §4.2 tabs 2-3): the single
-- cliente-visibility resolver every CRM child table's RLS calls, plus
-- contacto, oportunidad, and the oportunidad_servicio junction (multi-value
-- servicios_interes, catalog-enforced, RPC-only write path).
-- Source: sdd/crm-module/design (Engram obs #152), Migration Plan #3, DDL
-- section 3, Decision 6 (junction), Decision 7's Open Question (CAT5 guard
-- extension carried forward as task 3.9b).
--
-- Judgment call (disclosed): `oportunidad.estado` is `not null default
-- 'abierta'` per the design's own DDL. Unlike PR1's `tipo_cliente` (nullable,
-- so leaving it unseeded was schema-safe -- the design's own precedent), a
-- NOT NULL DEFAULT backed by a catalog FK requires its referent to exist for
-- ANY bare insert to succeed, in every environment, not just this migration's
-- test transaction. Seeding exactly the one row the DDL already commits to
-- (`estado_oportunidad`/`abierta`) is not a new business decision -- it is
-- what makes the shipped default functional. Every other new tipo/codigo
-- introduced by this PR (`perfil_decision`, `servicio_interes`, and any other
-- `estado_oportunidad` code) remains genuinely unseeded, per the Open
-- Question -- exactly PR1/PR2's posture.

-- ---------------------------------------------------------------------------
-- 1. private.cliente_visible(): the ONLY access-scoping predicate any CRM
--    child-table RLS policy may use (FC5). v1 = confirmed Decision #150.1:
--    everyone holding crm.ver sees every non-deleted cliente and its
--    children -- no ownership/area scoping yet (that is a future
--    access-scoping change that edits ONLY this function body). STABLE,
--    security definer, search_path pinned, same shape as has_permission().
--    Carries the FULL predicate itself so it is correct regardless of
--    whether the definer role bypasses RLS on public.cliente (FORCE ROW
--    LEVEL SECURITY is on, BYPASSRLS differs per environment).
-- ---------------------------------------------------------------------------
create or replace function private.cliente_visible(p_cliente_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cliente c
    where c.id = p_cliente_id
      and c.deleted_at is null
      and (select private.has_permission('crm', 'ver'))
  );
$$;

revoke all on function private.cliente_visible(bigint) from public, anon;
grant execute on function private.cliente_visible(bigint) to authenticated;
-- No public wrapper: only RLS policies call this; the UI reads v_cliente/
-- v_contacto/v_oportunidad instead.

-- ---------------------------------------------------------------------------
-- 2. contacto: mirrors cliente/tarea's full pattern (audit columns, FORCE
--    RLS, authenticated gets SELECT/INSERT/UPDATE never DELETE, soft-delete
--    via a private/public RPC pair, security_invoker view).
-- ---------------------------------------------------------------------------
create table public.contacto (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.cliente(id),
  nombre text not null,
  cargo text,
  correo text,
  telefono text,
  notas text,
  perfil_decision text,
  perfil_decision_cat_tipo text not null default 'perfil_decision'
    check (perfil_decision_cat_tipo = 'perfil_decision'),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz,
  constraint contacto_perfil_fk foreign key (perfil_decision_cat_tipo, perfil_decision)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict
);
create index contacto_cliente_idx on public.contacto(cliente_id) where deleted_at is null;

create trigger contacto_audit_fields
  before insert or update on public.contacto
  for each row execute function private.audit_fields();

-- ---------------------------------------------------------------------------
-- 3. oportunidad: same full pattern as contacto, plus the composite
--    unique(id, cliente_id) that backs oportunidad_servicio's denormalized
--    cliente_id FK below.
-- ---------------------------------------------------------------------------
create table public.oportunidad (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.cliente(id),
  nombre text not null,
  problema_detectado text,
  solucion_propuesta text,
  proyectos_anteriores text,
  valor_estimado_cop numeric(14, 2) check (valor_estimado_cop is null or valor_estimado_cop >= 0),
  estado text not null default 'abierta',
  estado_cat_tipo text not null default 'estado_oportunidad'
    check (estado_cat_tipo = 'estado_oportunidad'),
  fecha_ultima_gestion date,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz,
  constraint oportunidad_estado_fk foreign key (estado_cat_tipo, estado)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  -- Backs the composite FK from oportunidad_servicio: makes the denormalized
  -- cliente_id (an RLS input on the junction) impossible to drift.
  constraint oportunidad_id_cliente_uk unique (id, cliente_id)
);
create index oportunidad_cliente_idx on public.oportunidad(cliente_id) where deleted_at is null;

create trigger oportunidad_audit_fields
  before insert or update on public.oportunidad
  for each row execute function private.audit_fields();

-- ---------------------------------------------------------------------------
-- 4. oportunidad_servicio: multi-select catalog junction (servicios_interes).
--    Decision 6: authenticated never gets DELETE anywhere in this codebase, a
--    junction needs DELETE to unselect, so the ONLY write path is the
--    definer RPC below (set-replacement semantics). authenticated gets
--    SELECT only -- no INSERT/UPDATE/DELETE grant exists at all, for anyone.
-- ---------------------------------------------------------------------------
create table public.oportunidad_servicio (
  oportunidad_id bigint not null,
  cliente_id bigint not null,
  servicio_codigo text not null,
  servicio_cat_tipo text not null default 'servicio_interes'
    check (servicio_cat_tipo = 'servicio_interes'),
  primary key (oportunidad_id, servicio_codigo),
  constraint oportunidad_servicio_oportunidad_fk
    foreign key (oportunidad_id, cliente_id)
    references public.oportunidad (id, cliente_id) on delete restrict,
  constraint oportunidad_servicio_catalogo_fk
    foreign key (servicio_cat_tipo, servicio_codigo)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict
);
create index oportunidad_servicio_cliente_idx on public.oportunidad_servicio(cliente_id);

-- ---------------------------------------------------------------------------
-- 5. RLS enabled + FORCED on all 3 new tables.
-- ---------------------------------------------------------------------------
alter table public.contacto enable row level security;
alter table public.contacto force row level security;
alter table public.oportunidad enable row level security;
alter table public.oportunidad force row level security;
alter table public.oportunidad_servicio enable row level security;
alter table public.oportunidad_servicio force row level security;

-- ---------------------------------------------------------------------------
-- 6. Grants (authenticated AND service_role in the SAME migration -- the
--    PR1/PR2 convention). Discriminators (perfil_decision_cat_tipo,
--    estado_cat_tipo, servicio_cat_tipo) are deliberately absent from every
--    UPDATE grant, same tamper-proofing as the audit columns.
-- ---------------------------------------------------------------------------
revoke all on public.contacto from anon, authenticated;
grant select, insert on public.contacto to authenticated;
grant update (cliente_id, nombre, cargo, correo, telefono, perfil_decision, notas)
  on public.contacto to authenticated;
grant select, insert on public.contacto to service_role;
grant update (cliente_id, nombre, cargo, correo, telefono, perfil_decision, notas)
  on public.contacto to service_role;

revoke all on public.oportunidad from anon, authenticated;
grant select, insert on public.oportunidad to authenticated;
grant update (cliente_id, nombre, problema_detectado, solucion_propuesta,
              valor_estimado_cop, estado, fecha_ultima_gestion, proyectos_anteriores)
  on public.oportunidad to authenticated;
grant select, insert on public.oportunidad to service_role;
grant update (cliente_id, nombre, problema_detectado, solucion_propuesta,
              valor_estimado_cop, estado, fecha_ultima_gestion, proyectos_anteriores)
  on public.oportunidad to service_role;

-- No INSERT/UPDATE/DELETE grant exists at all, for anyone -- the definer RPC
-- below is the only write path (Decision 6).
revoke all on public.oportunidad_servicio from anon, authenticated;
grant select on public.oportunidad_servicio to authenticated;
grant select on public.oportunidad_servicio to service_role;

-- ---------------------------------------------------------------------------
-- 7. Policies (helper calls wrapped in (select ...) per the RLS perf rule).
--    contacto and oportunidad share an identical shape; oportunidad_servicio
--    is SELECT-only.
-- ---------------------------------------------------------------------------
create policy contacto_select on public.contacto
  for select to authenticated
  using (deleted_at is null and (select private.cliente_visible(cliente_id)));
create policy contacto_insert on public.contacto
  for insert to authenticated
  with check ((select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'crear')));
create policy contacto_update on public.contacto
  for update to authenticated
  using (deleted_at is null and (select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'editar')))
  with check (deleted_at is null and (select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'editar')));

create policy oportunidad_select on public.oportunidad
  for select to authenticated
  using (deleted_at is null and (select private.cliente_visible(cliente_id)));
create policy oportunidad_insert on public.oportunidad
  for insert to authenticated
  with check ((select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'crear')));
create policy oportunidad_update on public.oportunidad
  for update to authenticated
  using (deleted_at is null and (select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'editar')))
  with check (deleted_at is null and (select private.cliente_visible(cliente_id)) and (select private.has_permission('crm', 'editar')));

create policy oportunidad_servicio_select on public.oportunidad_servicio
  for select to authenticated
  using ((select private.cliente_visible(cliente_id)));

-- ---------------------------------------------------------------------------
-- 8. Views (security_invoker, filter deleted_at is null, exclude
--    discriminators).
-- ---------------------------------------------------------------------------
create view public.v_contacto
with (security_invoker = true) as
  select id, cliente_id, nombre, cargo, correo, telefono, perfil_decision, notas,
         created_at, created_by, updated_at, updated_by
  from public.contacto
  where deleted_at is null;

create view public.v_oportunidad
with (security_invoker = true) as
  select id, cliente_id, nombre, problema_detectado, solucion_propuesta,
         proyectos_anteriores, valor_estimado_cop, estado, fecha_ultima_gestion,
         created_at, created_by, updated_at, updated_by
  from public.oportunidad
  where deleted_at is null;

revoke all on public.v_contacto from anon, authenticated;
revoke all on public.v_oportunidad from anon, authenticated;
grant select on public.v_contacto to authenticated;
grant select on public.v_oportunidad to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Soft-delete RPCs (CO4/OP2): identical shape to soft_delete_cliente.
-- ---------------------------------------------------------------------------
create or replace function private.soft_delete_contacto(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('crm', 'eliminar')) then
    raise exception 'permission denied: crm.eliminar required' using errcode = '42501';
  end if;
  update public.contacto set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.soft_delete_oportunidad(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('crm', 'eliminar')) then
    raise exception 'permission denied: crm.eliminar required' using errcode = '42501';
  end if;
  update public.oportunidad set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

create or replace function public.soft_delete_contacto(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_contacto(p_id);
$$;

create or replace function public.soft_delete_oportunidad(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_oportunidad(p_id);
$$;

revoke all on function private.soft_delete_contacto(bigint) from public, anon;
revoke all on function private.soft_delete_oportunidad(bigint) from public, anon;
grant execute on function private.soft_delete_contacto(bigint) to authenticated;
grant execute on function private.soft_delete_oportunidad(bigint) to authenticated;

revoke all on function public.soft_delete_contacto(bigint) from public, anon;
revoke all on function public.soft_delete_oportunidad(bigint) from public, anon;
grant execute on function public.soft_delete_contacto(bigint) to authenticated;
grant execute on function public.soft_delete_oportunidad(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. set_oportunidad_servicios(p_oportunidad_id, p_codigos): the ONLY write
--     path for oportunidad_servicio. Delete-then-insert full-set-replace,
--     gated on cliente_visible + crm.editar. Runs as the function owner
--     (elevated privilege), so it can INSERT/DELETE on oportunidad_servicio
--     even though the base table grants neither to authenticated -- exactly
--     the same shape as every other private.* definer function in this
--     codebase, and the reason Decision 6 requires no base-table write grant
--     at all: the invariant "authenticated never gets DELETE" holds even
--     though this RPC deletes internally.
-- ---------------------------------------------------------------------------
create or replace function private.set_oportunidad_servicios(p_oportunidad_id bigint, p_codigos text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id bigint;
begin
  select cliente_id into v_cliente_id from public.oportunidad
    where id = p_oportunidad_id and deleted_at is null;
  if not found then
    raise exception 'permission denied: oportunidad not found or not visible' using errcode = '42501';
  end if;

  if not ((select private.cliente_visible(v_cliente_id))
          and (select private.has_permission('crm', 'editar'))) then
    raise exception 'permission denied: crm.editar required' using errcode = '42501';
  end if;

  delete from public.oportunidad_servicio where oportunidad_id = p_oportunidad_id;
  insert into public.oportunidad_servicio (oportunidad_id, cliente_id, servicio_codigo)
    select p_oportunidad_id, v_cliente_id, unnest(p_codigos);
end;
$$;

create or replace function public.set_oportunidad_servicios(p_oportunidad_id bigint, p_codigos text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_oportunidad_servicios(p_oportunidad_id, p_codigos);
$$;

revoke all on function private.set_oportunidad_servicios(bigint, text[]) from public, anon;
grant execute on function private.set_oportunidad_servicios(bigint, text[]) to authenticated;
revoke all on function public.set_oportunidad_servicios(bigint, text[]) from public, anon;
grant execute on function public.set_oportunidad_servicios(bigint, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Extend soft_delete_catalogo's CAT5 referential guard (task 3.9b,
--     carried forward from design Decision 7's Open Question) to this PR's 3
--     new catalog-consuming columns: contacto.perfil_decision,
--     oportunidad.estado, oportunidad_servicio.servicio_codigo. The junction
--     has no deleted_at of its own -- its "in use" state follows its parent
--     oportunidad's deleted_at, same as every other visibility rule here.
-- ---------------------------------------------------------------------------
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
  ) then
    raise exception 'catalogo code in use: cannot deactivate %/%', p_tipo, p_codigo
      using errcode = '23503';
  end if;

  update public.catalogo set activo = false
  where tipo = p_tipo and codigo = p_codigo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Functional seed (disclosed judgment call, see file header): the single
--     code the design's own NOT NULL DEFAULT already commits to. Not a
--     business decision -- makes the shipped default work in every
--     environment, exactly the way PR1 seeded estado_cliente/prioridad
--     before promoting their CHECKs to FKs.
-- ---------------------------------------------------------------------------
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('estado_oportunidad', 'abierta', 'Abierta', 1)
on conflict (tipo, codigo) do nothing;
