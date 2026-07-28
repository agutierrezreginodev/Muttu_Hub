import { createClient } from "@/lib/supabase/server";

export interface UsuarioDirectoryEntry {
  nombre: string;
  email: string;
}

export type UsuarioDirectory = Map<string, UsuarioDirectoryEntry>;

/**
 * All active users keyed by id, used to resolve audit columns
 * (created_by/updated_by) and registro_acceso.usuario_id to a display name
 * (spec §3.4: audit fields visible on the relevant detail views). Reads
 * v_usuario_activo (security_invoker) — never recreates an equivalent
 * query against the base table.
 */
export async function getUsuarioDirectory(): Promise<UsuarioDirectory> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_usuario_activo")
    .select("id, nombre, email");

  const directory: UsuarioDirectory = new Map();
  for (const row of data ?? []) {
    directory.set(row.id, { nombre: row.nombre, email: row.email });
  }
  return directory;
}

export function resolveUsuarioLabel(
  directory: UsuarioDirectory,
  id: string | null,
): string {
  if (!id) {
    return "—";
  }
  const entry = directory.get(id);
  return entry ? entry.nombre : "—";
}

export interface RolOption {
  id: number;
  nombre: string;
  activo: boolean;
}

/** All roles (active and inactive) — rol is readable by every authenticated user (permissions are not secret, design decision). */
export async function listRoles(): Promise<RolOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rol")
    .select("id, nombre, activo")
    .order("nombre");
  return data ?? [];
}
