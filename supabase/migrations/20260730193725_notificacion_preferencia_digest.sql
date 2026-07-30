-- Kanban module slice 3: notificacion_preferencia + digest_envio (§9 --
-- notification engine's DB layer). NOT tarea-dependent -- lands in parallel
-- with the main kanban chain (parallel branch, per tasks obs #179 slice 3).
-- Source: sdd/kanban-module/design-part2 (Engram obs #177 §9, correction C7),
-- spec-part2 (obs #175, DG3/DG4/DG8), proposal N4 resolution (obs #173:
-- personal-only digest, no team/manager rollup -- so notificacion_preferencia
-- needs no per-team/role columns, just per-user).

-- -----------------------------------------------------------------------------
-- 0. Generic updated_at trigger (CORRECTION C7). private.audit_fields() CANNOT
--    be attached to notificacion_preferencia: it unconditionally assigns
--    new.created_by/new.updated_by (audit.sql:47-56), and plpgsql raises
--    "record new has no field created_by" on a table without those columns.
--    This 8-line function is the minimal correct substitute, and excluding
--    updated_at from the grant makes the timestamp trigger-owned -- the same
--    tamper-proofing every audit column gets.
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();   -- clock_timestamp(), not now(): same
  return new;                            -- reasoning as audit.sql:34-39
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. notificacion_preferencia: per-user opt-OUT. ABSENCE of a row = opted IN
--    (DG3), so there is NO backfill and no migration over existing users.
-- -----------------------------------------------------------------------------
create table public.notificacion_preferencia (
  usuario_id uuid primary key references public.usuario(id),
  resumen_diario_email boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger notificacion_preferencia_touch
  before update on public.notificacion_preferencia
  for each row execute function private.touch_updated_at();

alter table public.notificacion_preferencia enable row level security;
alter table public.notificacion_preferencia force row level security;

revoke all on public.notificacion_preferencia from anon, authenticated;
grant select, insert on public.notificacion_preferencia to authenticated;
grant update (resumen_diario_email) on public.notificacion_preferencia to authenticated;
-- usuario_id (the PK / identity) and updated_at (trigger-owned) are
-- deliberately ABSENT from the UPDATE grant. No DELETE, for anyone.
grant select on public.notificacion_preferencia to service_role;
-- SELECT only: the digest READS the opt-out flag and never writes it.

create policy notificacion_preferencia_select on public.notificacion_preferencia
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy notificacion_preferencia_insert on public.notificacion_preferencia
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy notificacion_preferencia_update on public.notificacion_preferencia
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
-- UPDATE requires a SELECT policy to find the row first -- present above.
-- No DELETE policy and no DELETE grant.

create view public.v_notificacion_preferencia
with (security_invoker = true) as
  select usuario_id, resumen_diario_email, updated_at
  from public.notificacion_preferencia;
revoke all on public.v_notificacion_preferencia from anon, authenticated;
grant select on public.v_notificacion_preferencia to authenticated;
-- Disclosed judgment call: this view is arguably redundant -- the table has no
-- deleted_at and no discriminator to hide, and RLS already scopes it to the
-- caller's own row, which is why registro_acceso and bitacora_cliente have no
-- view at all. It is kept anyway for CONSUMER SYMMETRY: every read in
-- src/lib/** goes through a v_* surface, and 4 lines is cheaper than an
-- inconsistency. It also keeps the absorbed pgTAP assertion ("the view is
-- security_invoker") satisfiable.

-- -----------------------------------------------------------------------------
-- 2. digest_envio: append-only idempotency + audit log. Mirrors
--    registro_acceso (audit.sql:20-26): no audit columns, no deleted_at, no
--    UPDATE/DELETE grant statement for ANYONE. unique(usuario_id, fecha_envio)
--    IS the idempotency mechanism, on the BOGOTA calendar day -- not on a UTC
--    timestamp, so "once a day" survives the UTC fire hour.
-- -----------------------------------------------------------------------------
create table public.digest_envio (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuario(id),
  fecha_envio date not null,
  item_count integer not null check (item_count > 0),
  created_at timestamptz not null default now(),
  constraint digest_envio_usuario_fecha_uk unique (usuario_id, fecha_envio)
);
create index digest_envio_usuario_idx on public.digest_envio(usuario_id, fecha_envio desc);
-- item_count > 0: a zero-item digest is never sent (no-content suppression),
-- so a zero row would be a bug, and the CHECK says so structurally.

alter table public.digest_envio enable row level security;
alter table public.digest_envio force row level security;

revoke all on public.digest_envio from anon, authenticated;
grant select on public.digest_envio to authenticated;
-- NO insert/update/delete grant for authenticated AT ALL. This is the
-- immutability AND the write-authority mechanism, not policy absence.
grant select, insert on public.digest_envio to service_role;
-- service_role has rolbypassrls, but BYPASSRLS does NOT skip table-privilege
-- checks -- the grant is required (the entire lesson of
-- 20260728050000_service_role_grants.sql:1-16).

-- N6 (closed on the stated default): own row OR admin.ver.
create policy digest_envio_select on public.digest_envio
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select private.has_permission('admin', 'ver'))
  );
-- No INSERT/UPDATE/DELETE policy -- no grant for them to attach to.
-- No view: registro_acceso has none either.
