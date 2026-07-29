"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { getOrigin } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Accion, Modulo, PermisosOverride } from "@/lib/permissions";
import {
  catalogoCreateSchema,
  catalogoUpdateSchema,
  editUserSchema,
  inviteUserSchema,
  roleSchema,
} from "@/lib/admin/schemas";

export interface AdminActionState {
  error?: string;
  success?: boolean;
}

/**
 * Next.js Server Actions are reachable by ANY authenticated caller, not
 * only by whoever happens to be looking at the admin page that defines
 * them (routes/layouts do not scope which sessions may invoke an action).
 * Every admin action below re-checks has_permission() itself via the
 * caller's own RLS-gated client before doing anything privileged — this
 * matters MOST for the actions that then switch to the service-role
 * client (invite/deactivate/reactivate), because service_role bypasses
 * RLS entirely and would otherwise have no gate at all.
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

/**
 * Invite user (task 4.4, spec U8). Service-role Server Action: usuario
 * INSERT is service-role only (design RLS matrix) and inviteUserByEmail is
 * an Admin API call. Mirrors scripts/bootstrap-admin.ts's invite mechanism.
 */
export async function inviteUserAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = inviteUserSchema.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    rolId: formData.get("rolId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const { nombre, email, rolId } = parsed.data;
  const serviceRole = createServiceRoleClient();

  const { data: rol, error: rolError } = await serviceRole
    .from("rol")
    .select("id")
    .eq("id", rolId)
    .maybeSingle();

  if (rolError || !rol) {
    return { error: es.common.genericError };
  }

  const origin = await getOrigin();
  const { data: invited, error: inviteError } =
    await serviceRole.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/actualizar-clave`,
    });

  if (inviteError || !invited?.user) {
    return { error: es.common.genericError };
  }

  const { error: insertError } = await serviceRole.from("usuario").insert({
    id: invited.user.id,
    nombre,
    email,
    rol_id: rolId,
  });

  if (insertError) {
    return { error: es.common.genericError };
  }

  const { error: registroError } = await serviceRole
    .from("registro_acceso")
    .insert({ usuario_id: invited.user.id, evento: "invitacion" });

  if (registroError) {
    console.error(
      "Failed to write registro_acceso(invitacion):",
      registroError.message,
    );
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

/**
 * Edit user (task 4.5): role + permisos_override. Uses the regular
 * RLS-gated client, not service role — has_permission('admin','editar') is
 * both our own pre-check and the real usuario_update RLS policy.
 */
export async function updateUserAction(
  usuarioId: string,
  rolId: number,
  permisosOverride: PermisosOverride | null,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = editUserSchema.safeParse({
    usuarioId,
    rolId,
    // permisos_override is optional/nullable on the row; an empty grid and
    // "no override at all" are the same thing, so normalize null -> {}.
    permisosOverride: permisosOverride ?? {},
  });

  if (!parsed.success) {
    return { error: es.common.genericError };
  }

  const isEmptyOverride =
    Object.keys(parsed.data.permisosOverride).length === 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("usuario")
    .update({
      rol_id: parsed.data.rolId,
      permisos_override: isEmptyOverride ? null : parsed.data.permisosOverride,
    })
    .eq("id", parsed.data.usuarioId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

/**
 * Deactivate user (task 4.6, spec U6). Service-role Server Action: banning
 * and force-signing-out a DIFFERENT user requires the Auth Admin API, and
 * writing the registro_acceso('desactivacion') row targets the affected
 * user's id, not the caller's own — that INSERT would fail the
 * "own row only" RLS policy for a regular authenticated client (by design;
 * see the residual note in sdd/platform-foundation/tasks). Reversible via
 * reactivateUserAction.
 */
export async function deactivateUserAction(
  targetUsuarioId: string,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const serviceRole = createServiceRoleClient();

  // ~100 years, the exact value Supabase's own docs use for an indefinite
  // ban (there is no "forever" sentinel — only "none" to lift a ban).
  const { error: banError } = await serviceRole.auth.admin.updateUserById(
    targetUsuarioId,
    { ban_duration: "876000h" },
  );

  if (banError) {
    return { error: es.common.genericError };
  }

  const { error: updateError } = await serviceRole
    .from("usuario")
    .update({ activo: false })
    .eq("id", targetUsuarioId);

  if (updateError) {
    return { error: es.common.genericError };
  }

  const { error: registroError } = await serviceRole
    .from("registro_acceso")
    .insert({ usuario_id: targetUsuarioId, evento: "desactivacion" });

  if (registroError) {
    console.error(
      "Failed to write registro_acceso(desactivacion):",
      registroError.message,
    );
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

/** Reactivate user (task 4.6, spec U6). Reverses deactivateUserAction exactly. */
export async function reactivateUserAction(
  targetUsuarioId: string,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const serviceRole = createServiceRoleClient();

  const { error: unbanError } = await serviceRole.auth.admin.updateUserById(
    targetUsuarioId,
    { ban_duration: "none" },
  );

  if (unbanError) {
    return { error: es.common.genericError };
  }

  const { error: updateError } = await serviceRole
    .from("usuario")
    .update({ activo: true })
    .eq("id", targetUsuarioId);

  if (updateError) {
    return { error: es.common.genericError };
  }

  const { error: registroError } = await serviceRole
    .from("registro_acceso")
    .insert({ usuario_id: targetUsuarioId, evento: "reactivacion" });

  if (registroError) {
    console.error(
      "Failed to write registro_acceso(reactivacion):",
      registroError.message,
    );
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

/** Create role (task 4.7, spec U5). Regular RLS-gated client — rol_insert requires has_permission('admin','crear'). */
export async function createRoleAction(input: {
  nombre: string;
  descripcion: string;
  permisos: unknown;
}): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rol").insert({
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion ?? null,
    permisos: parsed.data.permisos,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

/** Edit role (task 4.7, spec U5). Regular RLS-gated client — rol_update requires has_permission('admin','editar'). DB CHECK (private.permisos_grid_valid) is the real shape guarantee; this zod parse is the earlier, friendlier gate. */
export async function updateRoleAction(input: {
  rolId: number;
  nombre: string;
  descripcion: string;
  permisos: unknown;
}): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rol")
    .update({
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion ?? null,
      permisos: parsed.data.permisos,
    })
    .eq("id", input.rolId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

/**
 * Toggle a role's activo flag (task 4.7's CRUD "delete", spec §3.4: never
 * hard-delete). has_permission()'s WHERE clause already requires r.activo,
 * so deactivating a role denies everyone holding it without touching any
 * user row — reversible the same way.
 */
export async function toggleRoleActivoAction(
  rolId: number,
  activo: boolean,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rol")
    .update({ activo })
    .eq("id", rolId);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

/**
 * Create catalogo (task 5.3, spec CAT4): any tipo/codigo, zero migrations.
 * Regular RLS-gated client — catalogo_insert requires
 * has_permission('admin','crear') directly in Postgres (design RLS table);
 * this pre-check is the earlier, friendlier gate.
 */
export async function createCatalogoAction(input: {
  tipo: string;
  codigo: string;
  etiqueta: string;
  orden: number;
}): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = catalogoCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("catalogo").insert({
    tipo: parsed.data.tipo,
    codigo: parsed.data.codigo,
    etiqueta: parsed.data.etiqueta,
    orden: parsed.data.orden,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/catalogos");
  return { success: true };
}

/**
 * Edit catalogo (task 5.3): etiqueta/orden only — tipo/codigo are the
 * immutable natural key (CAT1) and are not part of the grant-restricted
 * UPDATE list, so the DB itself would reject any attempt to change them.
 */
export async function updateCatalogoAction(
  tipo: string,
  codigo: string,
  input: { etiqueta: string; orden: number },
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("editar");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = catalogoUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo")
    .update({ etiqueta: parsed.data.etiqueta, orden: parsed.data.orden })
    .eq("tipo", tipo)
    .eq("codigo", codigo);

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/catalogos");
  return { success: true };
}

/**
 * Deactivate catalogo (task 5.3, spec CAT3/CAT5). `activo` carries no
 * direct UPDATE grant at all (design Decision 7) — the `soft_delete_catalogo`
 * RPC is the ONLY path that can flip it, and it enforces CAT5's referential
 * guard server-side (rejects a tipo/codigo still referenced by any
 * non-deleted cliente/tarea row with Postgres errcode 23503). There is no
 * reactivate path in this schema (unlike `rol.activo`, which carries a
 * normal UPDATE grant) — once deactivated, a code stays deactivated.
 */
export async function deactivateCatalogoAction(
  tipo: string,
  codigo: string,
): Promise<AdminActionState> {
  const permissionError = await assertAdminPermission("eliminar");
  if (permissionError) {
    return { error: permissionError };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_catalogo", {
    p_tipo: tipo,
    p_codigo: codigo,
  });

  if (error) {
    if (error.code === "23503") {
      return { error: es.admin.catalogos.deactivateInUseError };
    }
    return { error: es.common.genericError };
  }

  revalidatePath("/admin/catalogos");
  return { success: true };
}
