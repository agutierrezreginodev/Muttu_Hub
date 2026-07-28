-- crm_cliente_ext (crm-module PR2, §4.2 General tab): 9 new `cliente`
-- columns, their additive column-level UPDATE grants, a `v_cliente` rebuild,
-- and the required extension of `private.soft_delete_catalogo`'s CAT5
-- referential guard to the 4 new catalog-consuming columns.
-- Source: sdd/crm-module/design (Engram obs #152), Migration Plan #2 + DDL
-- section 2 + Decision 7's Open Question note.
--
-- Column-to-type map (design DDL, verbatim -- fully specified, no ambiguity
-- left to this PR): 4 of the 9 columns are descriptive/classification fields
-- and get the pinned-discriminator catalog-FK treatment (same mechanism as
-- PR1's cliente.tipo_cliente/estado and tarea.prioridad); the other 5 are
-- plain free-text/date columns with no RLS/CHECK branching on them (CAT8
-- does not apply -- they are narrative or scalar, not classification lists):
--   empresa                    text  plain
--   tamano_organizacion        text  catalog FK, tipo 'tamano_organizacion'
--   ubicacion                  text  plain
--   canal_contacto_inicial     text  catalog FK, tipo 'canal_contacto'
--   fecha_primer_contacto      date  plain
--   prioridad                  text  catalog FK, tipo 'prioridad' (SAME tipo
--                                    as tarea.prioridad -- shares the seeded
--                                    Alta/Media/Baja codes from PR1)
--   nivel_madurez               text  catalog FK, tipo 'nivel_madurez'
--   prioridades_identificadas  text  plain
--   riesgos_barreras           text  plain

-- ---------------------------------------------------------------------------
-- 1. 9 new columns + 4 pinned-discriminator FKs (Decision 1's mechanism,
--    unchanged from PR1). Discriminators are NEVER UPDATE-granted (section 2
--    below) -- same tamper-proofing treatment as the audit columns.
-- ---------------------------------------------------------------------------
alter table public.cliente
  add column empresa text,
  add column tamano_organizacion text,
  add column tamano_organizacion_cat_tipo text not null default 'tamano_organizacion'
    check (tamano_organizacion_cat_tipo = 'tamano_organizacion'),
  add column ubicacion text,
  add column canal_contacto_inicial text,
  add column canal_contacto_inicial_cat_tipo text not null default 'canal_contacto'
    check (canal_contacto_inicial_cat_tipo = 'canal_contacto'),
  add column fecha_primer_contacto date,
  add column prioridad text,
  add column prioridad_cat_tipo text not null default 'prioridad'
    check (prioridad_cat_tipo = 'prioridad'),
  add column nivel_madurez text,
  add column nivel_madurez_cat_tipo text not null default 'nivel_madurez'
    check (nivel_madurez_cat_tipo = 'nivel_madurez'),
  add column prioridades_identificadas text,
  add column riesgos_barreras text,
  add constraint cliente_tamano_fk foreign key (tamano_organizacion_cat_tipo, tamano_organizacion)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  add constraint cliente_canal_fk foreign key (canal_contacto_inicial_cat_tipo, canal_contacto_inicial)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  add constraint cliente_prioridad_fk foreign key (prioridad_cat_tipo, prioridad)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  add constraint cliente_nivel_madurez_fk foreign key (nivel_madurez_cat_tipo, nivel_madurez)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Additive column-level UPDATE grants (FC2 -- the proposal's HIGH-
--    likelihood-failure risk). ADDITIVE: `20260728041925_audit.sql` and
--    `20260728050000_service_role_grants.sql` are NOT edited (Decision 5,
--    both already applied on main) -- Postgres column grants accumulate, so
--    this supplements the existing `(nombre, tipo_cliente,
--    responsable_interno_id, estado)` list without revoking it. The 4
--    `_cat_tipo` discriminators are deliberately absent here, exactly like
--    the audit columns and `deleted_at`.
-- ---------------------------------------------------------------------------
grant update (empresa, tamano_organizacion, ubicacion, canal_contacto_inicial,
              fecha_primer_contacto, prioridad, nivel_madurez,
              prioridades_identificadas, riesgos_barreras)
  on public.cliente to authenticated;

grant update (empresa, tamano_organizacion, ubicacion, canal_contacto_inicial,
              fecha_primer_contacto, prioridad, nivel_madurez,
              prioridades_identificadas, riesgos_barreras)
  on public.cliente to service_role;

-- ---------------------------------------------------------------------------
-- 3. v_cliente rebuild (FC4). `create or replace view` is legal here:
--    existing columns keep their exact position/type and the 9 new ones are
--    appended. The view's ACL survives a `create or replace view` (it is not
--    a drop+recreate), so no re-grant is needed -- verified against the
--    existing `revoke all ... ; grant select ... to authenticated` from
--    0003_audit, still in force after this statement. Discriminators are
--    excluded on purpose (never surfaced to the app layer).
-- ---------------------------------------------------------------------------
create or replace view public.v_cliente
with (security_invoker = true) as
  select id, nombre, tipo_cliente, responsable_interno_id, estado,
         created_at, created_by, updated_at, updated_by,
         empresa, tamano_organizacion, ubicacion, canal_contacto_inicial,
         fecha_primer_contacto, prioridad, nivel_madurez,
         prioridades_identificadas, riesgos_barreras
  from public.cliente
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. Extend soft_delete_catalogo's CAT5 referential guard (design Decision
--    7's Open Question: "PR2 ... MUST extend this function's guard when they
--    add more catalog-consuming columns, the same way grant lists get
--    extended per PR"). Known consuming columns are now: cliente.tipo_cliente,
--    cliente.estado, tarea.prioridad (PR1) plus cliente.tamano_organizacion,
--    cliente.canal_contacto_inicial, cliente.prioridad, cliente.nivel_madurez
--    (this PR). Note cliente.prioridad shares the 'prioridad' tipo with
--    tarea.prioridad -- both must be checked for that tipo, not just tarea's.
--    PR3 (contacto/oportunidad) must extend this again in its own migration.
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
  ) then
    raise exception 'catalogo code in use: cannot deactivate %/%', p_tipo, p_codigo
      using errcode = '23503';
  end if;

  update public.catalogo set activo = false
  where tipo = p_tipo and codigo = p_codigo;
end;
$$;
