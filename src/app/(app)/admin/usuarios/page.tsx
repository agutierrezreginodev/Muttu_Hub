import type { Metadata } from "next";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  getUsuarioDirectory,
  listRoles,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { UsersTable, type UserRow } from "./users-table";
import { InviteUserDialog } from "./invite-user-dialog";

export const metadata: Metadata = {
  title: `${es.admin.users} · ${es.admin.title} · ${es.common.appName}`,
};

/**
 * Users list (task 4.3): reads v_usuario_activo (security_invoker view,
 * never recreates an equivalent query against the base table). Container
 * component — fetches server-side, hands plain data to the presentational
 * table + dialogs.
 */
export default async function UsuariosPage() {
  const supabase = await createClient();

  const [{ data: usuarios }, roles, directory] = await Promise.all([
    supabase
      .from("v_usuario_activo")
      .select(
        "id, nombre, email, rol_id, permisos_override, activo, created_at, created_by, updated_at, updated_by",
      )
      .order("nombre"),
    listRoles(),
    getUsuarioDirectory(),
  ]);

  const roleNameById = new Map(roles.map((rol) => [rol.id, rol.nombre]));

  const rows: UserRow[] = (usuarios ?? []).map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rolId: usuario.rol_id,
    rolNombre: roleNameById.get(usuario.rol_id) ?? "—",
    permisosOverride: usuario.permisos_override ?? {},
    activo: usuario.activo,
    createdAt: usuario.created_at,
    createdBy: resolveUsuarioLabel(directory, usuario.created_by),
    updatedAt: usuario.updated_at,
    updatedBy: resolveUsuarioLabel(directory, usuario.updated_by),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.admin.users}</h1>
        <InviteUserDialog roles={roles} />
      </div>
      <UsersTable rows={rows} roles={roles} />
    </div>
  );
}
