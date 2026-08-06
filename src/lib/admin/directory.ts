import { createClient } from "@/lib/supabase/server";
import {
  resolveUsuarioLabel,
  type RolOption,
  type UsuarioDirectory,
  type UsuarioOption,
} from "@/lib/admin/directory-options";

export type {
  RolOption,
  UsuarioDirectory,
  UsuarioDirectoryEntry,
  UsuarioOption,
} from "@/lib/admin/directory-options";
export { resolveUsuarioLabel };

/**
 * All active users keyed by id, used to resolve audit columns
 * (created_by/updated_by) and registro_acceso.usuario_id to a display name
 * (spec §3.4: audit fields visible on the relevant detail views). Reads
 * v_usuario_activo (security_invoker) — never recreates an equivalent
 * query against the base table.
 *
 * SERVER-ONLY (imports `createClient`, which uses `next/headers`). The pure
 * `resolveUsuarioLabel` helper and its types are re-exported above for
 * convenience in Server Components, but a `"use client"` file MUST import
 * them from `@/lib/admin/directory-options` directly instead of from this
 * file — see that file's doc comment for the exact bug this split fixes
 * (documentos-repositorio PR5a, mirroring the earlier catalogo-options.ts
 * split from PR7).
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

/**
 * Active users as a flat, name-ordered option list — the source for a
 * responsable `<Select>` (Kanban's tarea form, spec KT1). Same `v_usuario_activo`
 * read as `getUsuarioDirectory`, kept as its own function rather than derived
 * from that Map because a picker needs a defined order and the Map is keyed by
 * uuid. Empty list, never an error, matching every other list function here.
 */
export async function listUsuarioOptions(): Promise<UsuarioOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_usuario_activo")
    .select("id, nombre")
    .order("nombre");

  return (data ?? []).map((row) => ({ id: row.id, nombre: row.nombre }));
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
