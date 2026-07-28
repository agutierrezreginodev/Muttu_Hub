-- crm_catalogos (crm-module PR1, §4.7): generic catalogo(tipo, codigo) table
-- + the pinned-discriminator FK mechanism, and the CHECK->FK promotion of
-- cliente.tipo_cliente, cliente.estado, tarea.prioridad onto it.
-- Source: sdd/crm-module/design (Engram obs #152), Decision 1.
--
-- Mechanism note (Decision 1): each consuming column is paired with a
-- pinned-constant discriminator (`<col>_cat_tipo text not null default
-- '<tipo>' check (<col>_cat_tipo = '<tipo>')`) plus a composite FK to
-- catalogo(tipo, codigo). This is plain SQL-92 (a provably-constant column
-- feeding a composite FK) — chosen over a stored generated discriminator
-- column specifically because that alternative's exact Postgres semantics
-- inside a composite FK were never verified empirically. The discriminator
-- is excluded from every `grant update (...)` list, same tamper-proofing the
-- audit columns use.
--
-- Seed note (Decision 2 / Open Question 1): only `estado_cliente` and
-- `prioridad` codes are seeded below — the two catalogs that already had a
-- confirmed, business-approved value list (the pre-existing CHECK lists).
-- `tipo_cliente` intentionally has ZERO seeded codes: the design's own Open
-- Question defers its business-approved codes alongside the 6 other new
-- CRM catalogs (nivel_madurez, tamano_organizacion, canal_contacto,
-- perfil_decision, estado_oportunidad, servicio_interes), and inventing
-- placeholder labels here would be a product decision this migration has no
-- authority to make. This is schema-safe: the FK is MATCH SIMPLE (default),
-- so the column's current all-NULL state (no cliente row has ever had
-- tipo_cliente populated) passes trivially with zero seeded rows. Any
-- non-null value is rejected until PR5's admin UI adds real codes — which is
-- exactly the intended behavior, not a defect.

-- ---------------------------------------------------------------------------
-- 1. catalogo: generic classification-list storage. Natural text codes
--    (tipo, codigo) as PK is what makes every promotion below value-
--    preserving — no id-vs-text refactor, no data rewrite.
--    Decision 7: activo boolean only (no deleted_at, no DELETE grant
--    anywhere) — activo=false IS deactivation. CORRECTIVE FIX (post-verify,
--    obs #155 C1/W1): Decision 7 originally also dropped the
--    soft_delete_catalogo() RPC in favor of a bare admin.editar-gated column
--    UPDATE; that left CAT5's referential guard unenforceable and silently
--    contradicted CAT3's literal RPC requirement. Restored below (section 6)
--    instead of documenting the gap as an accepted deviation, since the
--    established RPC pattern is the more consistent fix.
-- ---------------------------------------------------------------------------
create table public.catalogo (
  tipo text not null,
  codigo text not null,
  etiqueta text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  primary key (tipo, codigo)
);
create index catalogo_tipo_orden_idx on public.catalogo(tipo, orden) where activo;

create trigger catalogo_audit_fields
  before insert or update on public.catalogo
  for each row execute function private.audit_fields();

-- ---------------------------------------------------------------------------
-- 2. RLS + grants. Mirrors `rol`: readable by any authenticated user (catalog
--    values are not secret), writes gated on admin.crear/admin.editar,
--    column-restricted UPDATE (tipo/codigo are the immutable natural key),
--    authenticated and service_role granted in THIS SAME migration (avoids
--    the platform-foundation PR2 gap that needed a follow-up fix migration).
-- ---------------------------------------------------------------------------
alter table public.catalogo enable row level security;
alter table public.catalogo force row level security;

-- `activo` is deliberately EXCLUDED from both column-level UPDATE grants
-- below (corrective fix, verify obs #155 C1 / W1): it gets the exact same
-- tamper-proofing treatment as `deleted_at` on every other domain table —
-- excluded from the grant, settable only via a SECURITY DEFINER function.
-- CAT3 mandates deactivation via a `soft_delete_catalogo()` RPC gated on
-- `admin.eliminar`, "same shape as rol/cliente/tarea"; CAT5 mandates that
-- deactivating an in-use code is rejected. Routing `activo` exclusively
-- through the RPC below (see section 6) is what makes CAT5's referential
-- guard actually reachable — a bare column UPDATE has no enforcement point.
revoke all on public.catalogo from anon, authenticated;
grant select, insert on public.catalogo to authenticated;
grant update (etiqueta, orden) on public.catalogo to authenticated;
grant select, insert on public.catalogo to service_role;
grant update (etiqueta, orden) on public.catalogo to service_role;

create policy catalogo_select on public.catalogo
  for select to authenticated using (true);
create policy catalogo_insert on public.catalogo
  for insert to authenticated
  with check ((select private.has_permission('admin','crear')));
create policy catalogo_update on public.catalogo
  for update to authenticated
  using ((select private.has_permission('admin','editar')))
  with check ((select private.has_permission('admin','editar')));

-- ---------------------------------------------------------------------------
-- 3. v_catalogo: picklist surface for forms. Active codes only, ordered for
--    display. Admin CRUD (PR5) reads the base table instead (needs inactive
--    rows), exactly as the roles screen reads `rol` directly.
-- ---------------------------------------------------------------------------
create view public.v_catalogo
with (security_invoker = true) as
  select tipo, codigo, etiqueta, orden from public.catalogo
  where activo order by tipo, orden, etiqueta;

revoke all on public.v_catalogo from anon, authenticated;
grant select on public.v_catalogo to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seeds (on conflict do nothing). Preserve every existing cliente/tarea
--    row's stored value verbatim: no UPDATE statement runs against those
--    tables here, and the FK below only ever validates, never rewrites.
-- ---------------------------------------------------------------------------
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('estado_cliente', 'activo', 'Activo', 1),
  ('estado_cliente', 'inactivo', 'Inactivo', 2),
  ('estado_cliente', 'standby', 'Standby', 3),
  ('prioridad', 'Alta', 'Alta', 1),
  ('prioridad', 'Media', 'Media', 2),
  ('prioridad', 'Baja', 'Baja', 3)
on conflict (tipo, codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 5. CHECK -> catalog FK promotion (CAT6). MATCH SIMPLE (the default) is
--    required: any existing NULL tipo_cliente/prioridad value must keep
--    passing, and MATCH FULL would reject a NULL pair.
--    tarea.estado / tarea.origen are NOT touched (CAT7) — they stay CHECK,
--    they are RLS/vencido-derivation discriminators, not classification
--    lists (Decision 1 of sdd/crm-module/decisions, Engram obs #150).
-- ---------------------------------------------------------------------------
alter table public.cliente drop constraint cliente_estado_check;
alter table public.cliente
  add column tipo_cliente_cat_tipo text not null default 'tipo_cliente'
    check (tipo_cliente_cat_tipo = 'tipo_cliente'),
  add column estado_cat_tipo text not null default 'estado_cliente'
    check (estado_cat_tipo = 'estado_cliente'),
  add constraint cliente_tipo_cliente_fk foreign key (tipo_cliente_cat_tipo, tipo_cliente)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  add constraint cliente_estado_fk foreign key (estado_cat_tipo, estado)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict;

alter table public.tarea drop constraint tarea_prioridad_check;
alter table public.tarea
  add column prioridad_cat_tipo text not null default 'prioridad'
    check (prioridad_cat_tipo = 'prioridad'),
  add constraint tarea_prioridad_fk foreign key (prioridad_cat_tipo, prioridad)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict;

-- ---------------------------------------------------------------------------
-- 6. soft_delete_catalogo(p_tipo, p_codigo): the ONLY path that can ever set
--    activo = false (corrective fix — verify obs #155, C1/W1). CAT3 mandates
--    this exact RPC shape ("same shape as rol/cliente/tarea"), gated on
--    admin.eliminar. CAT5 mandates the referential guard below: a code
--    currently referenced by any non-deleted cliente/tarea row MUST be
--    rejected. `on delete restrict` on the composite FKs already blocks
--    hard-DELETE (tested above); this closes the other half of CAT5 for the
--    deactivation path, which a bare grant-restricted column UPDATE has no
--    enforcement point for.
--
--    Known consuming columns as of PR1: cliente.tipo_cliente, cliente.estado,
--    tarea.prioridad. PR2 (cliente extension) and PR3 (contacto/oportunidad)
--    each add more catalog-consuming columns — this function's guard MUST be
--    extended in those migrations' own `create or replace function` to check
--    the new columns too, exactly like grant lists are extended per PR.
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
        or (estado_cat_tipo = p_tipo and estado = p_codigo))
  ) or exists (
    select 1 from public.tarea
    where deleted_at is null
      and prioridad_cat_tipo = p_tipo and prioridad = p_codigo
  ) then
    raise exception 'catalogo code in use: cannot deactivate %/%', p_tipo, p_codigo
      using errcode = '23503';
  end if;

  update public.catalogo set activo = false
  where tipo = p_tipo and codigo = p_codigo;
end;
$$;

create or replace function public.soft_delete_catalogo(p_tipo text, p_codigo text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_catalogo(p_tipo, p_codigo);
$$;

revoke all on function private.soft_delete_catalogo(text, text) from public, anon;
grant execute on function private.soft_delete_catalogo(text, text) to authenticated;
revoke all on function public.soft_delete_catalogo(text, text) from public, anon;
grant execute on function public.soft_delete_catalogo(text, text) to authenticated;
