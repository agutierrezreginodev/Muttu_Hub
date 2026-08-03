"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import type { Accion, Modulo } from "@/lib/permissions";
import { documentoMetadataSchema } from "@/lib/documentos/schemas";

export interface DocumentosActionState {
  error?: string;
  success?: boolean;
}

/**
 * Mirrors `assertCrmPermission`/`assertAdminPermission` exactly, scoped to
 * the `documentos` module. Every Server Action below re-checks
 * `has_permission()` itself via the caller's own RLS-gated client before
 * doing anything — this is the earlier, friendlier gate; the real boundary
 * is Postgres RLS on `documento` (design "RLS composes category × module
 * verb × cliente scope" — cliente_visible AND has_permission AND
 * categoria_visible, all three AND-composed). RLS-gated client ONLY, never
 * `createServiceRoleClient()` — no auth-admin work happens here.
 */
async function assertDocumentosPermission(
  accion: Accion,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "documentos" satisfies Modulo,
    accion,
  });

  if (error || !allowed) {
    return es.common.genericError;
  }

  return null;
}

/**
 * Edit document metadata (task 4.6/4.7, spec document-library "Edit
 * document metadata"): rename / recategorize / edit description+tags.
 * Column-scoped UPDATE grant (design Data Model) excludes
 * `categoria_cat_tipo`/audit/`deleted_at`, so this can never touch anything
 * beyond `nombre`, `categoria`, `descripcion`, `tags`. Recategorizing into
 * an ungranted category is NOT checked here — the `documento_update` RLS
 * policy's WITH CHECK enforces `categoria_visible(new category)` (spec
 * "Recategorize into an ungranted category is blocked"); this pre-check
 * only gates the `editar` verb.
 */
export async function updateDocumentoAction(
  clienteId: number,
  documentoId: number,
  input: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    tags?: string[];
  },
): Promise<DocumentosActionState> {
  const permissionError = await assertDocumentosPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = documentoMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documento")
    .update({
      nombre: parsed.data.nombre,
      categoria: parsed.data.categoria,
      descripcion: parsed.data.descripcion ?? null,
      tags: parsed.data.tags,
    })
    .eq("id", documentoId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/documentos`);
  return { success: true };
}

/**
 * Soft-delete a document (task 4.6/4.7, spec document-library "Soft-delete
 * a document"): `public.soft_delete_documento` is the ONLY path that sets
 * `deleted_at` — `authenticated` never receives a DELETE grant on
 * `documento` at all (spec "No direct DELETE grant").
 */
export async function deleteDocumentoAction(
  clienteId: number,
  documentoId: number,
): Promise<DocumentosActionState> {
  const permissionError = await assertDocumentosPermission("eliminar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_documento", {
    p_id: documentoId,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath(`/crm/${clienteId}/documentos`);
  return { success: true };
}
