-- 0003_audit: append-only registro_acceso, audit triggers, has_permission(),
-- grants/REVOKEs, RLS + FORCE on all 5 tables, security_invoker views,
-- permission-checked soft-delete RPCs.
-- Source: sdd/platform-foundation/design (Engram obs #137).
--
-- Grant mechanics note: the design says "REVOKE UPDATE on audit columns +
-- deleted_at on domain tables". In Postgres a column-level REVOKE cannot
-- subtract from a table-level UPDATE grant (and Supabase default privileges
-- grant ALL to anon/authenticated on new public tables). The exclusion is
-- therefore implemented as: revoke ALL, then re-grant SELECT/INSERT at table
-- level and UPDATE only on the non-audit, non-deleted_at columns. Net effect
-- is exactly the design matrix; the audit trigger and the definer RPCs own
-- the protected columns.

-- ---------------------------------------------------------------------------
-- 1. registro_acceso: minimal access log (U7). APPEND-ONLY by design (D6
--    exception): no audit columns, no deleted_at, no UPDATE/DELETE grants or
--    policies. usuario_id + created_at answer who/when.
-- ---------------------------------------------------------------------------
create table public.registro_acceso (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuario(id),
  evento text not null check (evento in ('login','logout','invitacion','desactivacion','reactivacion')),
  created_at timestamptz not null default now()
);
create index registro_acceso_usuario_idx on public.registro_acceso(usuario_id);

-- ---------------------------------------------------------------------------
-- 2. Audit trigger: sets created_by/updated_by from the caller and stamps
--    updated_at. Attached to the FOUR domain tables only (never to
--    registro_acceso). Runs as invoker on purpose: it only rewrites NEW, so
--    it needs no extra privileges and works for service-role writes too
--    (auth.uid() is null there -> columns stay null).
--    Uses clock_timestamp(), not now(): now()/transaction_timestamp() is
--    frozen for the whole transaction, so two writes to the same row inside
--    one multi-statement transaction (a real scenario, and how pgTAP itself
--    runs every test file) would get an identical updated_at and could never
--    be shown to have advanced relative to created_at. clock_timestamp()
--    reflects actual wall-clock time on every call.
-- ---------------------------------------------------------------------------
create or replace function private.audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.updated_at := clock_timestamp();
    return new;
  elsif tg_op = 'UPDATE' then
    new.updated_by := (select auth.uid());
    new.updated_at := clock_timestamp();
    return new;
  end if;
  return new;
end;
$$;

create trigger rol_audit_fields
  before insert or update on public.rol
  for each row execute function private.audit_fields();
create trigger usuario_audit_fields
  before insert or update on public.usuario
  for each row execute function private.audit_fields();
create trigger cliente_audit_fields
  before insert or update on public.cliente
  for each row execute function private.audit_fields();
create trigger tarea_audit_fields
  before insert or update on public.tarea
  for each row execute function private.audit_fields();

-- ---------------------------------------------------------------------------
-- 3. has_permission(): permission resolution. Security definer in the private
--    schema (never exposed), search_path pinned. Override key present (even
--    false) beats the role; unknown/missing keys fall through to the role and
--    then to false => fail-closed. A non-boolean override value raises a cast
--    error, which also fails closed inside RLS evaluation.
-- ---------------------------------------------------------------------------
create or replace function private.has_permission(modulo text, accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (u.permisos_override -> modulo ->> accion)::boolean,
    (r.permisos -> modulo ->> accion)::boolean,
    false)
  from public.usuario u
  join public.rol r on r.id = u.rol_id
  where u.id = (select auth.uid())
    and u.activo
    and u.deleted_at is null
    and r.activo;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS: enabled + FORCED on all 5 tables (D8).
-- ---------------------------------------------------------------------------
alter table public.rol enable row level security;
alter table public.rol force row level security;
alter table public.usuario enable row level security;
alter table public.usuario force row level security;
alter table public.cliente enable row level security;
alter table public.cliente force row level security;
alter table public.tarea enable row level security;
alter table public.tarea force row level security;
alter table public.registro_acceso enable row level security;
alter table public.registro_acceso force row level security;

-- ---------------------------------------------------------------------------
-- 5. Grants. Supabase default privileges grant ALL on new public tables to
--    anon + authenticated; strip everything first, then re-grant the design
--    matrix. authenticated never gets DELETE anywhere. registro_acceso is
--    SELECT/INSERT only (append-only). UPDATE is column-granted excluding
--    audit columns and deleted_at (see header note).
-- ---------------------------------------------------------------------------
revoke all on public.rol from anon, authenticated;
revoke all on public.usuario from anon, authenticated;
revoke all on public.cliente from anon, authenticated;
revoke all on public.tarea from anon, authenticated;
revoke all on public.registro_acceso from anon, authenticated;

grant select, insert on public.rol to authenticated;
grant update (nombre, descripcion, permisos, activo) on public.rol to authenticated;

grant select on public.usuario to authenticated;
grant update (nombre, email, rol_id, permisos_override, activo) on public.usuario to authenticated;

grant select, insert on public.cliente to authenticated;
grant update (nombre, tipo_cliente, responsable_interno_id, estado) on public.cliente to authenticated;

grant select, insert on public.tarea to authenticated;
grant update (titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, etiquetas, origen) on public.tarea to authenticated;

grant select, insert on public.registro_acceso to authenticated;

-- Function privileges: default EXECUTE TO PUBLIC is removed; only
-- authenticated may call the permission resolver and the soft-delete entry
-- points. audit_fields is trigger-only.
revoke all on function private.has_permission(text, text) from public, anon;
grant execute on function private.has_permission(text, text) to authenticated;
revoke all on function private.audit_fields() from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Policies (design RLS matrix; helper calls wrapped in (select ...) per
--    the RLS performance rule).
-- ---------------------------------------------------------------------------
-- rol: readable by every authenticated user (permissions are not secret);
-- writes gated on admin.
create policy rol_select on public.rol
  for select to authenticated using (true);
create policy rol_insert on public.rol
  for insert to authenticated
  with check ((select private.has_permission('admin','crear')));
create policy rol_update on public.rol
  for update to authenticated
  using ((select private.has_permission('admin','editar')))
  with check ((select private.has_permission('admin','editar')));

-- usuario: internal directory (deleted profiles hidden); rows are created by
-- the service role only (no INSERT policy); edits gated on admin.editar.
create policy usuario_select on public.usuario
  for select to authenticated using (deleted_at is null);
create policy usuario_update on public.usuario
  for update to authenticated
  using ((select private.has_permission('admin','editar')))
  with check ((select private.has_permission('admin','editar')));

-- cliente: crm module permissions; soft-deleted rows invisible.
create policy cliente_select on public.cliente
  for select to authenticated
  using (deleted_at is null and (select private.has_permission('crm','ver')));
create policy cliente_insert on public.cliente
  for insert to authenticated
  with check ((select private.has_permission('crm','crear')));
create policy cliente_update on public.cliente
  for update to authenticated
  using (deleted_at is null and (select private.has_permission('crm','editar')))
  with check ((select private.has_permission('crm','editar')));

-- tarea: origen-aware. CRM rows need crm.*, Kanban rows need kanban.*,
-- Ambos rows accept either module's permission.
create policy tarea_select on public.tarea
  for select to authenticated
  using (
    deleted_at is null and (
      (origen = 'CRM' and (select private.has_permission('crm','ver')))
      or (origen = 'Kanban' and (select private.has_permission('kanban','ver')))
      or (origen = 'Ambos' and ((select private.has_permission('crm','ver')) or (select private.has_permission('kanban','ver'))))
    )
  );
create policy tarea_insert on public.tarea
  for insert to authenticated
  with check (
    (origen = 'CRM' and (select private.has_permission('crm','crear')))
    or (origen = 'Kanban' and (select private.has_permission('kanban','crear')))
    or (origen = 'Ambos' and ((select private.has_permission('crm','crear')) or (select private.has_permission('kanban','crear'))))
  );
create policy tarea_update on public.tarea
  for update to authenticated
  using (
    deleted_at is null and (
      (origen = 'CRM' and (select private.has_permission('crm','editar')))
      or (origen = 'Kanban' and (select private.has_permission('kanban','editar')))
      or (origen = 'Ambos' and ((select private.has_permission('crm','editar')) or (select private.has_permission('kanban','editar'))))
    )
  )
  with check (
    (origen = 'CRM' and (select private.has_permission('crm','editar')))
    or (origen = 'Kanban' and (select private.has_permission('kanban','editar')))
    or (origen = 'Ambos' and ((select private.has_permission('crm','editar')) or (select private.has_permission('kanban','editar'))))
  );

-- registro_acceso: append-only. Admin reads; any authenticated user appends
-- their OWN row only. No UPDATE/DELETE policies and no matching grants.
create policy registro_acceso_select on public.registro_acceso
  for select to authenticated
  using ((select private.has_permission('admin','ver')));
create policy registro_acceso_insert on public.registro_acceso
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Views (Postgres 15+ security_invoker: never bypass RLS). All filter out
--    soft-deleted rows. v_tarea derives vencido (D5): past fecha_limite and
--    not in a terminal state; never stored.
-- ---------------------------------------------------------------------------
create view public.v_cliente
with (security_invoker = true) as
  select id, nombre, tipo_cliente, responsable_interno_id, estado,
         created_at, created_by, updated_at, updated_by
  from public.cliente
  where deleted_at is null;

create view public.v_tarea
with (security_invoker = true) as
  select id, titulo, descripcion, responsable_id, cliente_id, fecha_limite,
         estado, prioridad, etiquetas, origen,
         created_at, created_by, updated_at, updated_by,
         (fecha_limite is not null and fecha_limite < now() and estado not in ('cumplido','cancelado')) as vencido
  from public.tarea
  where deleted_at is null;

create view public.v_usuario_activo
with (security_invoker = true) as
  select id, nombre, email, rol_id, permisos_override, activo,
         created_at, created_by, updated_at, updated_by
  from public.usuario
  where deleted_at is null;

revoke all on public.v_cliente from anon, authenticated;
revoke all on public.v_tarea from anon, authenticated;
revoke all on public.v_usuario_activo from anon, authenticated;
grant select on public.v_cliente to authenticated;
grant select on public.v_tarea to authenticated;
grant select on public.v_usuario_activo to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Soft-delete RPCs. Private security-definer functions check
--    has_permission(modulo,'eliminar') and then own the deleted_at column;
--    public thin wrappers (security invoker) are the only entry points.
--    Domain tables only: rol/usuario -> admin, cliente -> crm, tarea ->
--    origen-aware. registro_acceso has none (append-only).
-- ---------------------------------------------------------------------------
create or replace function private.soft_delete_rol(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('admin','eliminar')) then
    raise exception 'permission denied: admin.eliminar required' using errcode = '42501';
  end if;
  update public.rol set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.soft_delete_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('admin','eliminar')) then
    raise exception 'permission denied: admin.eliminar required' using errcode = '42501';
  end if;
  update public.usuario set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.soft_delete_cliente(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_permission('crm','eliminar')) then
    raise exception 'permission denied: crm.eliminar required' using errcode = '42501';
  end if;
  update public.cliente set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.soft_delete_tarea(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen text;
begin
  select origen into v_origen from public.tarea where id = p_id and deleted_at is null;
  if not found then
    return;
  end if;
  if (v_origen = 'CRM' and (select private.has_permission('crm','eliminar')))
     or (v_origen = 'Kanban' and (select private.has_permission('kanban','eliminar')))
     or (v_origen = 'Ambos' and ((select private.has_permission('crm','eliminar')) or (select private.has_permission('kanban','eliminar')))) then
    update public.tarea set deleted_at = now() where id = p_id;
  else
    raise exception 'permission denied: eliminar on the owning module required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.soft_delete_rol(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_rol(p_id);
$$;

create or replace function public.soft_delete_usuario(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_usuario(p_id);
$$;

create or replace function public.soft_delete_cliente(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_cliente(p_id);
$$;

create or replace function public.soft_delete_tarea(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_tarea(p_id);
$$;

revoke all on function private.soft_delete_rol(bigint) from public, anon;
revoke all on function private.soft_delete_usuario(uuid) from public, anon;
revoke all on function private.soft_delete_cliente(bigint) from public, anon;
revoke all on function private.soft_delete_tarea(bigint) from public, anon;
grant execute on function private.soft_delete_rol(bigint) to authenticated;
grant execute on function private.soft_delete_usuario(uuid) to authenticated;
grant execute on function private.soft_delete_cliente(bigint) to authenticated;
grant execute on function private.soft_delete_tarea(bigint) to authenticated;

revoke all on function public.soft_delete_rol(bigint) from public, anon;
revoke all on function public.soft_delete_usuario(uuid) from public, anon;
revoke all on function public.soft_delete_cliente(bigint) from public, anon;
revoke all on function public.soft_delete_tarea(bigint) from public, anon;
grant execute on function public.soft_delete_rol(bigint) to authenticated;
grant execute on function public.soft_delete_usuario(uuid) to authenticated;
grant execute on function public.soft_delete_cliente(bigint) to authenticated;
grant execute on function public.soft_delete_tarea(bigint) to authenticated;
