"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import type { Accion, Modulo } from "@/lib/permissions";

export interface CategoryGrantActionState {
  error?: string;
  success?: boolean;
}

/**
 * Same shape and reasoning as `assertAdminPermission` in
 * `src/lib/admin/actions.ts` and `assertDocumentosPermission` in
 * `src/lib/documentos/actions.ts`: Server Actions are reachable by ANY
 * authenticated caller regardless of which screen declared them, so each one
 * re-checks the verb itself. Duplicated rather than shared because the module
 * holding the original is `"use server"` — exporting the helper from there
 * would turn an internal check into its own callable endpoint.
 *
 * `admin.editar` specifically: that is the verb
 * `documento_categoria_permiso`'s own INSERT/DELETE policies require (PR1), so
 * checking anything else would admit requests Postgres then rejects.
 */
async function assertAdminPermission(accion: Accion): Promise<string | null> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "admin" satisfies Modulo,
    accion,
  });

  if (error || !allowed) {
    return es.common.genericError;
  }

  return null;
}

function validate(rolId: number, categoria: string): string | null {
  if (!Number.isInteger(rolId) || rolId <= 0) {
    return es.common.genericError;
  }
  if (categoria.trim().length === 0) {
    return es.common.requiredField;
  }
  return null;
}

/**
 * Grant a role access to a document category (task 7.1/7.2, spec
 * document-permissions "Category grants are admin-managed").
 *
 * The composite FK to `catalogo (tipo, codigo)` rejects a category code that
 * does not exist, so an invented code fails at the database rather than
 * silently creating a grant nobody can satisfy — surfaced here as the generic
 * error.
 */
export async function grantCategoryAction(
  rolId: number,
  categoria: string,
): Promise<CategoryGrantActionState> {
  const invalid = validate(rolId, categoria);
  if (invalid) {
    return { error: invalid };
  }

  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documento_categoria_permiso")
    .insert({ rol_id: rolId, categoria });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/documentos");
  return { success: true };
}

/**
 * Revoke one role → category grant. Both `eq` filters are required: the
 * primary key is `(rol_id, categoria)`, and deleting on `rol_id` alone would
 * strip every category from the role.
 *
 * Revoking is immediately effective on reads — `categoria_visible` is
 * evaluated per query — but it does NOT retroactively hide anything already
 * downloaded, and any signed URL minted before the revoke stays valid until it
 * expires (60s, see the download route).
 */
export async function revokeCategoryAction(
  rolId: number,
  categoria: string,
): Promise<CategoryGrantActionState> {
  const invalid = validate(rolId, categoria);
  if (invalid) {
    return { error: invalid };
  }

  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documento_categoria_permiso")
    .delete()
    .eq("rol_id", rolId)
    .eq("categoria", categoria);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/documentos");
  return { success: true };
}
