"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session/get-session-context";
import type { Accion, Modulo } from "@/lib/permissions";
import {
  clienteCreateSchema,
  clienteGeneralSchema,
  contactoSchema,
  oportunidadSchema,
  bitacoraSchema,
  compromisoSchema,
} from "@/lib/crm/schemas";

export interface CrmActionState {
  error?: string;
  success?: boolean;
}

/**
 * Mirrors `assertAdminPermission` (src/lib/admin/actions.ts) exactly, scoped
 * to the `crm` module. Every Server Action below re-checks
 * `has_permission()` itself via the caller's own RLS-gated client before
 * doing anything — this is the earlier, friendlier gate; Postgres RLS on
 * `cliente` is the real boundary (design decision "Security boundary").
 * RLS-gated client ONLY — never `createServiceRoleClient()`: there is no
 * auth-admin work in CRM (design UI Structure note).
 */
async function assertCrmPermission(accion: Accion): Promise<string | null> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "crm" satisfies Modulo,
    accion,
  });

  if (error || !allowed) {
    return es.common.genericError;
  }

  return null;
}

/**
 * Create cliente (task 6.5, task 6.7). Regular RLS-gated client —
 * `cliente_insert` requires `has_permission('crm','crear')` directly in
 * Postgres; this pre-check is the earlier, friendlier gate.
 */
export async function createClienteAction(input: {
  nombre: string;
  tipoCliente?: string;
  estado?: string;
}): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = clienteCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cliente").insert({
    nombre: parsed.data.nombre,
    tipo_cliente: parsed.data.tipoCliente ?? null,
    ...(parsed.data.estado ? { estado: parsed.data.estado } : {}),
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/crm");
  return { success: true };
}

/**
 * Update the ficha's General tab (task 6.5, spec FC1/FC2): the 9 columns
 * PR2 added to `cliente`. Regular RLS-gated client — `cliente_update`
 * requires `has_permission('crm','editar')` directly in Postgres AND the
 * column-level `grant update (...)` list PR2 extended
 * (supabase/migrations/20260728191042_crm_cliente_ext.sql) already scopes
 * exactly these 9 columns, so this UPDATE can never touch anything else.
 */
export async function updateClienteGeneralAction(
  clienteId: number,
  input: {
    empresa?: string;
    tamanoOrganizacion?: string;
    ubicacion?: string;
    canalContactoInicial?: string;
    fechaPrimerContacto?: string;
    prioridad?: string;
    nivelMadurez?: string;
    prioridadesIdentificadas?: string;
    riesgosBarreras?: string;
  },
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = clienteGeneralSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cliente")
    .update({
      empresa: parsed.data.empresa ?? null,
      tamano_organizacion: parsed.data.tamanoOrganizacion ?? null,
      ubicacion: parsed.data.ubicacion ?? null,
      canal_contacto_inicial: parsed.data.canalContactoInicial ?? null,
      fecha_primer_contacto: parsed.data.fechaPrimerContacto ?? null,
      prioridad: parsed.data.prioridad ?? null,
      nivel_madurez: parsed.data.nivelMadurez ?? null,
      prioridades_identificadas: parsed.data.prioridadesIdentificadas ?? null,
      riesgos_barreras: parsed.data.riesgosBarreras ?? null,
    })
    .eq("id", clienteId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}`);
  return { success: true };
}

interface ContactoActionInput {
  nombre: string;
  cargo?: string;
  correo?: string;
  telefono?: string;
  perfilDecision?: string;
  notas?: string;
}

/**
 * Create contacto (task 7.4, spec CO1-CO2). Regular RLS-gated client —
 * `contacto_insert` requires `cliente_visible(cliente_id) AND
 * has_permission('crm','crear')` directly in Postgres; this pre-check is
 * the earlier, friendlier gate.
 */
export async function createContactoAction(
  clienteId: number,
  input: ContactoActionInput,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = contactoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contacto").insert({
    cliente_id: clienteId,
    nombre: parsed.data.nombre,
    cargo: parsed.data.cargo ?? null,
    correo: parsed.data.correo ?? null,
    telefono: parsed.data.telefono ?? null,
    perfil_decision: parsed.data.perfilDecision ?? null,
    notas: parsed.data.notas ?? null,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/contactos`);
  return { success: true };
}

/**
 * Update contacto (task 7.4, spec CO2-CO3). The column-restricted `grant
 * update (...)` list (supabase/migrations/20260728193509_crm_contacto_oportunidad.sql)
 * already scopes exactly these columns, so this UPDATE can never touch
 * audit columns or `deleted_at`.
 */
export async function updateContactoAction(
  clienteId: number,
  contactoId: number,
  input: ContactoActionInput,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = contactoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacto")
    .update({
      nombre: parsed.data.nombre,
      cargo: parsed.data.cargo ?? null,
      correo: parsed.data.correo ?? null,
      telefono: parsed.data.telefono ?? null,
      perfil_decision: parsed.data.perfilDecision ?? null,
      notas: parsed.data.notas ?? null,
    })
    .eq("id", contactoId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/contactos`);
  return { success: true };
}

/**
 * Soft-delete contacto (task 7.4, spec CO4): `public.soft_delete_contacto`
 * is the ONLY path that sets `deleted_at` — `authenticated` never receives
 * a DELETE grant on `contacto` at all.
 */
export async function deleteContactoAction(
  clienteId: number,
  contactoId: number,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("eliminar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_contacto", {
    p_id: contactoId,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/contactos`);
  return { success: true };
}

interface OportunidadActionInput {
  nombre: string;
  problemaDetectado?: string;
  solucionPropuesta?: string;
  proyectosAnteriores?: string;
  /**
   * Raw form value: an HTML number input always sends a string (or "" when
   * cleared), never a number — `oportunidadSchema`'s preprocess step is what
   * coerces this to a number (or `undefined` when empty).
   */
  valorEstimadoCop?: number | string;
  estado?: string;
  fechaUltimaGestion?: string;
  /**
   * FULL set of catalog codes the multi-select currently holds. Every
   * caller of `createOportunidadAction`/`updateOportunidadAction` MUST pass
   * the complete current state here, never a partial add/remove diff — this
   * array is forwarded verbatim to `set_oportunidad_servicios`, whose own
   * server-side implementation is delete-then-insert-full-set (design
   * Decision 6). Sending anything less than the full set silently drops
   * codes the caller did not intend to remove.
   */
  serviciosInteres: string[];
}

/**
 * Applies the FULL servicios_interes set via the `set_oportunidad_servicios`
 * RPC (task 7.4, design Decision 6). Returns an error message or null.
 *
 * DELIBERATELY UNGATED — the caller owns the permission check. Extracting this
 * is what fixes a real partial-write defect: `createOportunidadAction` gates on
 * `crear`, but this step used to run through `setOportunidadServiciosAction`,
 * which independently re-checked `editar`. A caller holding `crear` without
 * `editar` therefore had the oportunidad row committed and only THEN got denied,
 * leaving a row with an empty servicios set while the UI reported failure.
 *
 * Setting the servicios of an oportunidad you are creating is part of creating
 * it, so on the create path this write belongs to `crear`, not `editar`.
 */
async function applyServiciosInteres(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oportunidadId: number,
  codigos: string[],
): Promise<string | null> {
  const { error } = await supabase.rpc("set_oportunidad_servicios", {
    p_oportunidad_id: oportunidadId,
    p_codigos: codigos,
  });

  return error ? es.common.genericError : null;
}

/**
 * Applies the FULL servicios_interes set from the UI's multi-select. Gated on
 * `editar` because it mutates an oportunidad that already exists; the
 * create/update paths call `applyServiciosInteres` directly under their own
 * gate instead of coming back through here.
 */
export async function setOportunidadServiciosAction(
  clienteId: number,
  oportunidadId: number,
  codigos: string[],
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const serviciosError = await applyServiciosInteres(
    supabase,
    oportunidadId,
    codigos,
  );
  if (serviciosError) {
    return { error: serviciosError };
  }

  revalidatePath(`/crm/${clienteId}/oportunidades`);
  return { success: true };
}

/**
 * Create oportunidad (task 7.4, spec OP1-OP2). After the row insert,
 * ALWAYS calls `setOportunidadServiciosAction` with the form's complete
 * `serviciosInteres` array — even on create, where the junction starts
 * empty, so the RPC's delete-then-insert has nothing to delete yet.
 */
export async function createOportunidadAction(
  clienteId: number,
  input: OportunidadActionInput,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = oportunidadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("oportunidad")
    .insert({
      cliente_id: clienteId,
      nombre: parsed.data.nombre,
      problema_detectado: parsed.data.problemaDetectado ?? null,
      solucion_propuesta: parsed.data.solucionPropuesta ?? null,
      proyectos_anteriores: parsed.data.proyectosAnteriores ?? null,
      valor_estimado_cop: parsed.data.valorEstimadoCop ?? null,
      ...(parsed.data.estado ? { estado: parsed.data.estado } : {}),
      fecha_ultima_gestion: parsed.data.fechaUltimaGestion ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: es.common.genericError };
  }

  // Called directly, NOT through setOportunidadServiciosAction: that one gates
  // on `editar`, and this path is already gated on `crear`. Going back through
  // it left a committed row with an empty servicios set for a crear-only caller.
  const serviciosError = await applyServiciosInteres(
    supabase,
    inserted.id,
    parsed.data.serviciosInteres,
  );
  if (serviciosError) {
    return { error: serviciosError };
  }

  revalidatePath(`/crm/${clienteId}/oportunidades`);
  return { success: true };
}

/**
 * Update oportunidad (task 7.4, spec OP2-OP4). Same set-replace discipline
 * as create: `parsed.data.serviciosInteres` is the form's complete current
 * state (every checkbox's current value, not a toggled delta) and is
 * forwarded as-is to `setOportunidadServiciosAction`.
 */
export async function updateOportunidadAction(
  clienteId: number,
  oportunidadId: number,
  input: OportunidadActionInput,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = oportunidadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("oportunidad")
    .update({
      nombre: parsed.data.nombre,
      problema_detectado: parsed.data.problemaDetectado ?? null,
      solucion_propuesta: parsed.data.solucionPropuesta ?? null,
      proyectos_anteriores: parsed.data.proyectosAnteriores ?? null,
      valor_estimado_cop: parsed.data.valorEstimadoCop ?? null,
      ...(parsed.data.estado ? { estado: parsed.data.estado } : {}),
      fecha_ultima_gestion: parsed.data.fechaUltimaGestion ?? null,
    })
    .eq("id", oportunidadId);

  if (error) {
    return { error: es.common.genericError };
  }

  // Same reasoning as the create path. Here the permission was already `editar`,
  // so the old double-check was redundant rather than wrong — but routing
  // through one ungated helper keeps a single gate per entry point.
  const serviciosError = await applyServiciosInteres(
    supabase,
    oportunidadId,
    parsed.data.serviciosInteres,
  );
  if (serviciosError) {
    return { error: serviciosError };
  }

  revalidatePath(`/crm/${clienteId}/oportunidades`);
  return { success: true };
}

/**
 * Soft-delete oportunidad (task 7.4, spec OP2): `public.soft_delete_oportunidad`
 * is the only path that sets `deleted_at` — same shape as
 * `deleteContactoAction`.
 */
export async function deleteOportunidadAction(
  clienteId: number,
  oportunidadId: number,
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("eliminar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_oportunidad", {
    p_id: oportunidadId,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/oportunidades`);
  return { success: true };
}

/**
 * Append a bitácora entry (task 8.3, spec BIT4/BIT5). INSERT-only,
 * append-only: `bitacora_cliente` has no UPDATE/DELETE grant at all (BIT2)
 * and no client anywhere in this codebase offers an edit/delete affordance
 * for an existing entry (BIT5) — corrections are new rows.
 *
 * `autor_id` is ALWAYS the caller's own session id, read server-side from
 * `getSessionContext()` — this action's own input type has no `autorId`
 * field at all (see `bitacoraSchema`), so there is no way for a caller to
 * even attempt to spoof it. This matches the INSERT policy's own
 * `with check (... and autor_id = (select auth.uid()))`
 * (supabase/migrations/20260728200200_crm_bitacora.sql): a mismatched
 * `autor_id` would be rejected by RLS (42501) regardless, so this is the
 * earlier, friendlier gate on top of the real one.
 */
export async function addBitacoraEntryAction(
  clienteId: number,
  input: { texto: string },
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const session = await getSessionContext();
  if (!session) {
    return { error: es.common.genericError };
  }

  const parsed = bitacoraSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bitacora_cliente").insert({
    cliente_id: clienteId,
    autor_id: session.userId,
    texto: parsed.data.texto,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/bitacora`);
  return { success: true };
}

/**
 * Create a compromiso (task 8.3, spec FC9, design Decision 9): a plain
 * `tarea` insert with `origen = 'CRM'` — no new table, no new view exists
 * for this. `estado` is left to the table's own `default 'pendiente'`,
 * which means `responsable_id` MUST be non-null (the
 * `borrador_sin_responsable` CHECK only allows a null responsable while
 * `estado = 'borrador'`,
 * supabase/migrations/20260728041924_domain.sql) — this PR's scope has no
 * assignee picker, so `responsable_id` defaults to the CREATING user
 * (documented simplification, see apply-progress).
 */
export async function createCompromisoAction(
  clienteId: number,
  input: { titulo: string; fechaLimite?: string; prioridad?: string },
): Promise<CrmActionState> {
  const permissionError = await assertCrmPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const session = await getSessionContext();
  if (!session) {
    return { error: es.common.genericError };
  }

  const parsed = compromisoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tarea").insert({
    titulo: parsed.data.titulo,
    cliente_id: clienteId,
    origen: "CRM",
    responsable_id: session.userId,
    fecha_limite: parsed.data.fechaLimite ?? null,
    ...(parsed.data.prioridad ? { prioridad: parsed.data.prioridad } : {}),
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/compromisos`);
  // Refreshes FichaHeader's "próximo compromiso" (spec FC7), fetched in
  // `[id]/layout.tsx` (shared across every tab under this cliente) — a
  // plain `revalidatePath(/crm/{id})` alone only revalidates the General
  // tab's own page cache entry, not the shared layout above it.
  revalidatePath(`/crm/${clienteId}`, "layout");
  return { success: true };
}
