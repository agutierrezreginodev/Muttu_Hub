import { createClient } from "@/lib/supabase/server";

/** Granted `categoria_documento` codes per rol id. */
export type CategoryGrants = Map<number, Set<string>>;

/**
 * Every role → category grant (task 7.1/7.2, spec document-permissions).
 *
 * `documento_categoria_permiso` is SELECT-readable by every authenticated user
 * (PR1's grants): which categories a role may see is configuration, not a
 * secret, the same posture as `rol.permisos`. Writes are the admin-only half.
 *
 * Trust-RLS like every other read here: no rows means no grants, never an
 * error.
 */
export async function listCategoryGrants(): Promise<CategoryGrants> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documento_categoria_permiso")
    .select("rol_id, categoria");

  const grants: CategoryGrants = new Map();
  for (const row of data ?? []) {
    const existing = grants.get(row.rol_id);
    if (existing) {
      existing.add(row.categoria);
    } else {
      grants.set(row.rol_id, new Set([row.categoria]));
    }
  }

  return grants;
}
