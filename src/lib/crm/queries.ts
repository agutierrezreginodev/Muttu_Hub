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
