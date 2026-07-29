"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import type { Accion, Modulo } from "@/lib/permissions";
import { clienteCreateSchema, clienteGeneralSchema } from "@/lib/crm/schemas";

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
