import type { Metadata } from "next";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { RolesTable, type RoleRow } from "./roles-table";
import { RoleFormDialog } from "./role-form-dialog";

export const metadata: Metadata = {
  title: `${es.admin.roles} · ${es.admin.title} · ${es.common.appName}`,
};

/**
 * Roles list (task 4.7, spec U5). rol is readable by every authenticated
 * user (permissions are not secret, design decision) — this page itself is
 * still only reachable by has_permission('admin','ver') via (app)/admin/layout.tsx.
 */
export default async function RolesPage() {
  const supabase = await createClient();

  const [{ data: roles }, directory] = await Promise.all([
    supabase
      .from("rol")
      .select(
        "id, nombre, descripcion, permisos, activo, created_at, created_by, updated_at, updated_by",
      )
      .order("nombre"),
    getUsuarioDirectory(),
  ]);

  const rows: RoleRow[] = (roles ?? []).map((rol) => ({
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion ?? "",
    permisos: rol.permisos,
    activo: rol.activo,
    createdAt: rol.created_at,
    createdBy: resolveUsuarioLabel(directory, rol.created_by),
    updatedAt: rol.updated_at,
    updatedBy: resolveUsuarioLabel(directory, rol.updated_by),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.admin.roles}</h1>
        <RoleFormDialog mode="create" />
      </div>
      <RolesTable rows={rows} />
    </div>
  );
}
