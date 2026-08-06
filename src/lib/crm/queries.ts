import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface ClienteListItem {
  id: number;
  nombre: string;
  tipoCliente: string | null;
  estado: string | null;
  createdAt: string;
}

/**
 * List clientes (task 6.3), optionally filtered by `nombre` (spec FC6).
 * Relies ENTIRELY on `cliente_select` RLS
 * (`deleted_at is null and has_permission('crm','ver')`,
 * supabase/migrations/20260728041925_audit.sql) — a caller without
 * `crm.ver` gets zero rows here, never a thrown error: a denied SELECT
 * under RLS returns an empty result set, it does not raise. This mirrors
 * every other query helper in the codebase (`getUsuarioDirectory`,
 * `listRoles`): ignore `error`, default to `[]`.
 */
export async function listClientes(
  search?: string,
): Promise<ClienteListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_cliente")
    .select("id, nombre, tipo_cliente, estado, created_at")
    .order("nombre");

  const trimmed = search?.trim();
  if (trimmed) {
    query = query.ilike("nombre", `%${trimmed}%`);
  }

  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    nombre: row.nombre,
    tipoCliente: row.tipo_cliente,
    estado: row.estado,
    createdAt: row.created_at,
  }));
}

export interface ClienteDetail {
  id: number;
  nombre: string;
  tipoCliente: string | null;
  responsableInternoId: string | null;
  estado: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  empresa: string | null;
  tamanoOrganizacion: string | null;
  ubicacion: string | null;
  canalContactoInicial: string | null;
  fechaPrimerContacto: string | null;
  prioridad: string | null;
  nivelMadurez: string | null;
  prioridadesIdentificadas: string | null;
  riesgosBarreras: string | null;
}

/**
 * Single cliente for the ficha shell (task 6.3). `React.cache()`'d so the
 * `[id]/layout.tsx` header fetch and the General tab's own `page.tsx` fetch
 * (same request) share one Supabase round trip instead of two — this is the
 * "fetches cliente ... ONCE" property the design's ficha shell requires,
 * achieved the same way `getSessionContext()` dedupes across a layout+page
 * pair. Reads `v_cliente` (never the base table) so soft-deleted clients
 * and the `_cat_tipo` discriminators stay invisible to the app layer.
 */
export const getCliente = cache(
  async (id: number): Promise<ClienteDetail | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_cliente")
      .select(
        "id, nombre, tipo_cliente, responsable_interno_id, estado, created_at, created_by, updated_at, updated_by, empresa, tamano_organizacion, ubicacion, canal_contacto_inicial, fecha_primer_contacto, prioridad, nivel_madurez, prioridades_identificadas, riesgos_barreras",
      )
      .eq("id", id)
      .maybeSingle();

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      nombre: data.nombre,
      tipoCliente: data.tipo_cliente,
      responsableInternoId: data.responsable_interno_id,
      estado: data.estado,
      createdAt: data.created_at,
      createdBy: data.created_by,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
      empresa: data.empresa,
      tamanoOrganizacion: data.tamano_organizacion,
      ubicacion: data.ubicacion,
      canalContactoInicial: data.canal_contacto_inicial,
      fechaPrimerContacto: data.fecha_primer_contacto,
      prioridad: data.prioridad,
      nivelMadurez: data.nivel_madurez,
      prioridadesIdentificadas: data.prioridades_identificadas,
      riesgosBarreras: data.riesgos_barreras,
    };
  },
);

export interface ProximoCompromiso {
  id: number;
  titulo: string;
  fechaLimite: string | null;
  estado: string;
  vencido: boolean;
}

/**
 * Ficha header's "próximo compromiso" (task 6.3, spec FC7): earliest
 * non-terminal `tarea` with `origen in ('CRM','Ambos')` tied to this
 * `cliente_id`, read from `v_tarea` so `vencido` is the view's OWN derived
 * column (`fecha_limite < now() and estado not in ('cumplido','cancelado')`,
 * supabase/migrations/20260728041925_audit.sql) — never recomputed or
 * stored here, per FC7's literal requirement.
 */
export async function getProximoCompromiso(
  clienteId: number,
): Promise<ProximoCompromiso | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select("id, titulo, fecha_limite, estado, vencido")
    .eq("cliente_id", clienteId)
    .in("origen", ["CRM", "Ambos"])
    .in("estado", ["borrador", "pendiente", "en_curso"])
    .order("fecha_limite", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    titulo: data.titulo,
    fechaLimite: data.fecha_limite,
    estado: data.estado,
    vencido: data.vencido,
  };
}

export interface ContactoListItem {
  id: number;
  clienteId: number;
  nombre: string;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
  perfilDecision: string | null;
  notas: string | null;
}

/**
 * List contactos for a cliente (task 7.2, spec CO5). Reads `v_contacto`
 * (never the base table), which already filters `deleted_at is null` and
 * relies on the `contacto_select` RLS policy (`private.cliente_visible`) —
 * a caller who cannot see this `clienteId` gets an empty result, not an
 * error, same convention as `listClientes`.
 */
export async function listContactos(
  clienteId: number,
): Promise<ContactoListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_contacto")
    .select(
      "id, cliente_id, nombre, cargo, correo, telefono, perfil_decision, notas",
    )
    .eq("cliente_id", clienteId)
    .order("nombre");

  return (data ?? []).map((row) => ({
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    cargo: row.cargo,
    correo: row.correo,
    telefono: row.telefono,
    perfilDecision: row.perfil_decision,
    notas: row.notas,
  }));
}

export interface OportunidadListItem {
  id: number;
  clienteId: number;
  nombre: string;
  problemaDetectado: string | null;
  solucionPropuesta: string | null;
  proyectosAnteriores: string | null;
  valorEstimadoCop: number | null;
  estado: string | null;
  fechaUltimaGestion: string | null;
  /** Full set of catalog codes currently attached via `oportunidad_servicio` (design Decision 6). */
  serviciosInteres: string[];
}

/**
 * List oportunidades for a cliente (task 7.2, spec OP1-OP5), including each
 * row's `servicios_interes` set from the `oportunidad_servicio` junction.
 * Two independent reads (view + junction), joined in memory — `v_oportunidad`
 * has no servicios column (design: the junction is a separate table, RPC-
 * only write path). Both reads are RLS-gated the same way `listContactos`
 * is: an invisible `clienteId` yields empty arrays, never an error.
 */
export async function listOportunidades(
  clienteId: number,
): Promise<OportunidadListItem[]> {
  const supabase = await createClient();
  const [{ data: oportunidades }, { data: servicios }] = await Promise.all([
    supabase
      .from("v_oportunidad")
      .select(
        "id, cliente_id, nombre, problema_detectado, solucion_propuesta, proyectos_anteriores, valor_estimado_cop, estado, fecha_ultima_gestion",
      )
      .eq("cliente_id", clienteId)
      .order("nombre"),
    supabase
      .from("oportunidad_servicio")
      .select("oportunidad_id, servicio_codigo")
      .eq("cliente_id", clienteId),
  ]);

  const serviciosByOportunidad = new Map<number, string[]>();
  for (const row of servicios ?? []) {
    const existing = serviciosByOportunidad.get(row.oportunidad_id);
    if (existing) {
      existing.push(row.servicio_codigo);
    } else {
      serviciosByOportunidad.set(row.oportunidad_id, [row.servicio_codigo]);
    }
  }

  return (oportunidades ?? []).map((row) => ({
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    problemaDetectado: row.problema_detectado,
    solucionPropuesta: row.solucion_propuesta,
    proyectosAnteriores: row.proyectos_anteriores,
    valorEstimadoCop: row.valor_estimado_cop,
    estado: row.estado,
    fechaUltimaGestion: row.fecha_ultima_gestion,
    serviciosInteres: serviciosByOportunidad.get(row.id) ?? [],
  }));
}

export interface BitacoraEntry {
  id: number;
  clienteId: number;
  autorId: string;
  texto: string;
  createdAt: string;
}

/**
 * List bitácora entries for a cliente (task 8.2, spec BIT1-BIT6),
 * newest-first, matching `bitacora_cliente_idx (cliente_id, created_at
 * desc)` (supabase/migrations/20260728200200_crm_bitacora.sql). Reads the
 * BASE table directly -- `bitacora_cliente` has no view (design DDL
 * section 4, same as `registro_acceso`) -- relying entirely on
 * `bitacora_cliente_select` RLS (`private.cliente_visible`) for visibility;
 * an invisible clienteId yields an empty array, never an error, same
 * convention as every other list function in this file.
 */
export async function listBitacora(
  clienteId: number,
): Promise<BitacoraEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bitacora_cliente")
    .select("id, cliente_id, autor_id, texto, created_at")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    clienteId: row.cliente_id,
    autorId: row.autor_id,
    texto: row.texto,
    createdAt: row.created_at,
  }));
}

/**
 * The origen partition Compromisos/Tareas relacionadas read from `v_tarea`
 * (task 8.2, spec FC9, design Decision 9) -- no new table, no new view.
 * `tarea.origen`'s own CHECK constraint
 * (supabase/migrations/20260728041924_domain.sql) only ever allows
 * `'CRM' | 'Kanban' | 'Ambos'`; these two predicates partition that set and
 * are mutually exclusive by construction (see queries.test.ts).
 */
export const COMPROMISO_ORIGENES = ["CRM", "Ambos"] as const;
export const TAREA_RELACIONADA_ORIGEN = "Kanban" as const;

export function isCompromisoOrigen(origen: string): boolean {
  return (COMPROMISO_ORIGENES as readonly string[]).includes(origen);
}

export function isTareaRelacionadaOrigen(origen: string): boolean {
  return origen === TAREA_RELACIONADA_ORIGEN;
}

export interface TareaListItem {
  id: number;
  titulo: string;
  descripcion: string | null;
  responsableId: string | null;
  fechaLimite: string | null;
  estado: string;
  prioridad: string | null;
  vencido: boolean;
  /**
   * Needed by the Compromisos tab's promote toggle (kanban slice 9), which
   * flips `'CRM' ⇄ 'Ambos'` and must render the current side. The `origen`
   * FILTER is unchanged — `COMPROMISO_ORIGENES` already admits `'Ambos'`;
   * only the selected shape grows.
   */
  origen: string;
}

function mapTareaRow(row: {
  id: number;
  titulo: string;
  descripcion: string | null;
  responsable_id: string | null;
  fecha_limite: string | null;
  estado: string;
  prioridad: string | null;
  vencido: boolean;
  origen: string;
}): TareaListItem {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    responsableId: row.responsable_id,
    fechaLimite: row.fecha_limite,
    estado: row.estado,
    prioridad: row.prioridad,
    vencido: row.vencido,
    origen: row.origen,
  };
}

/**
 * Compromisos tab (task 8.2, spec FC9): `v_tarea` filtered to
 * `cliente_id` + `origen in ('CRM','Ambos')`. Read + create only (design
 * Decision 9) -- creating one is a plain `tarea` insert via
 * `createCompromisoAction`, never a write against this view.
 */
export async function listCompromisos(
  clienteId: number,
): Promise<TareaListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select(
      "id, titulo, descripcion, responsable_id, fecha_limite, estado, prioridad, vencido, origen",
    )
    .eq("cliente_id", clienteId)
    .in("origen", COMPROMISO_ORIGENES)
    .order("fecha_limite", { ascending: true, nullsFirst: false });

  return (data ?? []).map(mapTareaRow);
}

/**
 * Tareas relacionadas tab (task 8.2, spec FC9): `v_tarea` filtered to
 * `cliente_id` + `origen = 'Kanban'`. READ-ONLY -- this is Kanban-origin
 * data; CRM only observes it, it never creates/edits/deletes here.
 */
export async function listTareasRelacionadas(
  clienteId: number,
): Promise<TareaListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select(
      "id, titulo, descripcion, responsable_id, fecha_limite, estado, prioridad, vencido, origen",
    )
    .eq("cliente_id", clienteId)
    .eq("origen", TAREA_RELACIONADA_ORIGEN)
    .order("fecha_limite", { ascending: true, nullsFirst: false });

  return (data ?? []).map(mapTareaRow);
}
