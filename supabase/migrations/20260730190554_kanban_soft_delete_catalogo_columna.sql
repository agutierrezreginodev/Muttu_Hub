-- kanban_soft_delete_catalogo_columna (kanban-module PR1b, §5.1 KC5): extends
-- private.soft_delete_catalogo's CAT5 referential guard to tarea.columna.
-- Source: sdd/kanban-module/design (Engram obs #176 §3 item 7, correction
-- C3), spec (obs #174, KC5), tasks (obs #179, slice 1b).
--
-- ---------------------------------------------------------------------------
-- *** CORRECTION C3 (MANDATORY): this body is copied from the CURRENT live
-- version at 20260730130000_documentos_repositorio.sql:160-208 -- the
-- 10-branch function (cliente.{tipo_cliente, estado, tamano_organizacion,
-- canal_contacto_inicial, prioridad, nivel_madurez}, tarea.prioridad,
-- contacto.perfil_decision, oportunidad.estado,
-- oportunidad_servicio.servicio_codigo, documento.categoria) -- NOT the stale
-- PR1 1-branch version at 20260728182944_crm_catalogos.sql:166-194. Copying
-- an older body would SILENTLY DROP referential guards with no test failure
-- unless a test happens to cover one of them. Exactly ONE new branch is added
-- below: tarea.columna, folded into the existing tarea exists() alongside
-- prioridad. pgTAP file kanban_soft_delete_catalogo_columna.sql's M2(c)
-- assertions are the regression tripwire that makes this verifiable.
--
-- *** CORRECTION C4 (2026-08-05, applied while rebasing this chain onto main):
-- this migration was authored 2026-07-30 against a main that did NOT yet
-- contain the documentos module, so its original body ended at the
-- oportunidad_servicio branch. documentos merged 2026-08-03 (PR #21) and
-- added the documento.categoria branch at 20260730130000, whose timestamp is
-- EARLIER than this file's -- so on any fresh migration run this file applies
-- LAST and its body wins outright. The original 9-branch body would therefore
-- have silently dropped documento.categoria: precisely the failure mode C3
-- above warns about, arriving from a module that did not exist when C3 was
-- written. `git` reports no conflict (zero shared files) and this PR's own CI
-- stayed green because its base branch predates documentos entirely. The
-- documento branch below is NOT optional -- pgTAP
-- documentos_repositorio_rls.sql:259 asserts it, and M2(e) in this PR's own
-- pgTAP file now asserts it survives THIS migration.
--
-- *** DELIBERATE NON-EXTENSION (design D4 / spec KC5): etiqueta_tarea is NOT
-- guarded. No `etiquetas && array[p_codigo]` branch is added. Deactivating a
-- tag stops it being OFFERED as an option going forward; it MUST NOT block
-- deactivation and MUST NOT alter any existing tarea.etiquetas value already
-- containing that code (historical labels are preserved as free text). Every
-- other catalog tipo in this function is guarded, so this deviation is
-- asserted POSITIVELY in the pgTAP file (M2(d)) to stop a future agent
-- "completing" the pattern by adding a guard here.
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
      and ((prioridad_cat_tipo = p_tipo and prioridad = p_codigo)
        or (columna_cat_tipo = p_tipo and columna = p_codigo))   -- <<< NEW (kanban, tarea.columna)
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

-- Not touched by this migration: the function's signature, its
-- language/security/search_path posture, the public.soft_delete_catalogo
-- invoker wrapper (crm_catalogos.sql:196-208, unaffected by a body-only
-- replace), the revoke/grant on either the private or public function
-- (crm_catalogos.sql:205-208, survives a `create or replace` since it is not
-- a drop+recreate), and every RLS policy on public.tarea (zero new policies
-- -- this migration only replaces a definer function's body).
