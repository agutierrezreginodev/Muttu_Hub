-- kanban_tablero (kanban-module PR1a, §5.1): board columns as catalog data,
-- tarea.columna + pinned discriminator + composite FK (same mechanism already
-- shipped for tarea.prioridad), the tarea-visibility resolver seam every
-- future Kanban child-table RLS policy must call, and the v_tarea rebuild
-- that appends `columna`.
-- Source: sdd/kanban-module/design (Engram obs #176, §3 migration 1 DDL,
-- corrections C2/C3/C9/C10, decisions D1-D3/D6/D7).
--
-- Scope note: this migration is slice 1a ONLY. It does NOT touch
-- private.soft_delete_catalogo — the CAT5 referential guard extension to
-- tarea.columna is slice 1b's own reviewable unit (regression-risk isolation,
-- sdd/kanban-module/tasks obs #179). Until 1b ships, an admin CAN deactivate
-- a columna_tablero code that is in use by a live tarea — a real but
-- temporary gap, closed in the very next PR.

-- ---------------------------------------------------------------------------
-- 1. Seeds FIRST. The composite FK added below validates existing rows at
--    `add constraint` time; with `columna` all-NULL and MATCH SIMPLE (the
--    default) that passes trivially, but the codes must exist before any
--    write path reaches for them (crm-module Decision 2 precedent).
--    Terminal codes `cumplido`/`cancelado` are deliberately named identically
--    to the `tarea.estado` values they map to (design D5) — the mapping
--    itself lives only in app-side `TERMINAL_COLUMNA_ESTADO` (slice 5b), this
--    naming is cosmetic alignment, not an enforced constraint.
-- ---------------------------------------------------------------------------
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('columna_tablero', 'por_hacer',   'Por hacer',     1),
  ('columna_tablero', 'en_curso',    'En curso',      2),
  ('columna_tablero', 'en_revision', 'En revisión',   3),
  ('columna_tablero', 'cumplido',    'Completada',    4),
  ('columna_tablero', 'cancelado',   'Cancelada',     5),
  ('etiqueta_tarea',  'comercial',      'Comercial',      1),
  ('etiqueta_tarea',  'administrativo', 'Administrativo', 2),
  ('etiqueta_tarea',  'proyecto',       'Proyecto',       3),
  ('etiqueta_tarea',  'interno',        'Interno',        4)
on conflict (tipo, codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 2. tarea.columna + pinned discriminator + composite FK (design D1). Same
--    mechanism as tarea.prioridad (20260728182944_crm_catalogos.sql:142-147).
--    NULLABLE by design (D3): no backfill, no CRM write-path change, no NULL
--    window. MATCH SIMPLE (the default) is required so the all-NULL column
--    passes. etiquetas gets NO discriminator and NO FK — Postgres has no
--    array-element FK; the etiquetasSchema Zod validator gates it instead.
-- ---------------------------------------------------------------------------
alter table public.tarea
  add column columna text,
  add column columna_cat_tipo text not null default 'columna_tablero'
    check (columna_cat_tipo = 'columna_tablero'),
  add constraint tarea_columna_fk foreign key (columna_cat_tipo, columna)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Indexes (design D6). tarea_responsable_idx / tarea_vencidas_idx from
--    20260728041924_domain.sql:39,41 are NOT dropped — the composite below is
--    partial (where deleted_at is null), so non-partial responsable reads
--    still need the original.
-- ---------------------------------------------------------------------------
create index tarea_columna_idx on public.tarea (columna) where deleted_at is null;
create index tarea_responsable_vencimiento_idx
  on public.tarea (responsable_id, fecha_limite) where deleted_at is null;
create index tarea_etiquetas_gin_idx
  on public.tarea using gin (etiquetas) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. ADDITIVE column grants (correction C2). 20260728041925_audit.sql:137 and
--    20260728050000_service_role_grants.sql:34 are NOT edited — they are
--    already-applied migrations, and editing an applied migration is a
--    no-op under `supabase db push` while appearing to work under
--    `db reset` (crm-module Decision 5; precedent
--    20260728191042_crm_cliente_ext.sql:58-76). Column grants accumulate.
--    BOTH grantees are required: `authenticated` for the board,
--    `service_role` for parity with every other column on this table.
--    columna_cat_tipo is deliberately absent — same tamper-proofing as the
--    audit columns and deleted_at. Assertion M1 counts both grant rows.
-- ---------------------------------------------------------------------------
grant update (columna) on public.tarea to authenticated;
grant update (columna) on public.tarea to service_role;

-- ---------------------------------------------------------------------------
-- 5. private.tarea_origen_permite(): the ONE origen-aware authorization body
--    for every tarea child table (design D7). Mirrors public.tarea's own
--    three policies (audit.sql:188-217) branch for branch, and
--    cliente_visible()'s shape (crm_contacto_oportunidad.sql:32-48): stable,
--    security definer, search_path pinned, and it carries the FULL predicate
--    itself so it is correct regardless of whether the definer role
--    bypasses RLS on public.tarea (FORCE ROW LEVEL SECURITY is on and
--    BYPASSRLS differs per environment). A future access-scoping change
--    edits ONLY this body.
-- ---------------------------------------------------------------------------
create or replace function private.tarea_origen_permite(p_tarea_id bigint, p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tarea t
    where t.id = p_tarea_id
      and t.deleted_at is null
      and (
        (t.origen = 'CRM'    and (select private.has_permission('crm', p_accion)))
        or (t.origen = 'Kanban' and (select private.has_permission('kanban', p_accion)))
        or (t.origen = 'Ambos'  and ((select private.has_permission('crm', p_accion))
                                  or (select private.has_permission('kanban', p_accion))))
      )
  );
$$;

-- The named seam the proposal commits to. Thin wrapper, zero duplicated
-- logic; the ONLY thing a child table's SELECT policy may call.
create or replace function private.tarea_visible(p_tarea_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tarea_origen_permite(p_tarea_id, 'ver');
$$;

revoke all on function private.tarea_origen_permite(bigint, text) from public, anon;
revoke all on function private.tarea_visible(bigint) from public, anon;
grant execute on function private.tarea_origen_permite(bigint, text) to authenticated;
grant execute on function private.tarea_visible(bigint) to authenticated;
-- No public wrapper for either: only RLS policies call them; the UI reads
-- v_tarea (exactly cliente_visible()'s posture,
-- crm_contacto_oportunidad.sql:49-50).

-- ---------------------------------------------------------------------------
-- 6. v_tarea rebuild. `create or replace view` is legal: all 15 existing
--    columns keep their exact position and type, `columna` is APPENDED after
--    `vencido`. The view's ACL survives a replace (it is not a drop+recreate),
--    so the revoke/grant from audit.sql:257,260 stays in force — precedent
--    v_cliente at 20260728191042_crm_cliente_ext.sql:79-95.
--    THE `vencido` EXPRESSION IS COPIED BYTE-FOR-BYTE FROM audit.sql:245.
--    Do not "simplify" it: CRM's ficha header and TareaTable read it, and a
--    future parity test asserts classify() (slice 10) agrees with it.
--    columna_cat_tipo is excluded — discriminators are never surfaced.
-- ---------------------------------------------------------------------------
create or replace view public.v_tarea
with (security_invoker = true) as
  select id, titulo, descripcion, responsable_id, cliente_id, fecha_limite,
         estado, prioridad, etiquetas, origen,
         created_at, created_by, updated_at, updated_by,
         (fecha_limite is not null and fecha_limite < now() and estado not in ('cumplido','cancelado')) as vencido,
         columna
  from public.tarea
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Not touched by this migration, and that is load-bearing: `tarea.estado`'s
-- CHECK (domain.sql:25-26) keeps exactly
-- borrador,pendiente,en_curso,cumplido,cancelado; `borrador_sin_responsable`
-- (:37) stands; the three `tarea_*` RLS policies (audit.sql:188-217) are
-- unchanged (Kanban is a read of an already-secured table — zero new
-- policies on `tarea`); `private.soft_delete_tarea`'s origen branching
-- (:312-333) is unchanged and already covers Kanban. `tarea.origen`'s CHECK
-- is unchanged. `private.soft_delete_catalogo` is NOT extended here — that is
-- slice 1b (CAT5 guard extension), a deliberately separate PR.
-- ---------------------------------------------------------------------------
