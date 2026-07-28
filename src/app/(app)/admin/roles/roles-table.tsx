"use client";

import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PermisosGrid } from "@/lib/permissions";
import { RoleFormDialog } from "./role-form-dialog";
import { ToggleRoleActivoDialog } from "./toggle-role-activo-dialog";

export interface RoleRow {
  id: number;
  nombre: string;
  descripcion: string;
  permisos: PermisosGrid;
  activo: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface RolesTableProps {
  rows: RoleRow[];
}

/** Presentational table (container/presentational pattern). */
export function RolesTable({ rows }: RolesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.admin.roleName}</TableHead>
          <TableHead>{es.admin.roleDescription}</TableHead>
          <TableHead>{es.admin.status}</TableHead>
          <TableHead>{es.admin.createdBy}</TableHead>
          <TableHead>{es.admin.updatedBy}</TableHead>
          <TableHead className="text-right">{es.common.edit}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.descripcion || "—"}
            </TableCell>
            <TableCell>
              <Badge variant={row.activo ? "default" : "secondary"}>
                {row.activo ? es.admin.active : es.admin.inactive}
              </Badge>
            </TableCell>
            <TableCell
              className="text-sm text-muted-foreground"
              title={row.createdAt}
            >
              {row.createdBy}
            </TableCell>
            <TableCell
              className="text-sm text-muted-foreground"
              title={row.updatedAt}
            >
              {row.updatedBy}
            </TableCell>
            <TableCell className="flex justify-end gap-2 text-right">
              <RoleFormDialog mode="edit" role={row} />
              <ToggleRoleActivoDialog
                rolId={row.id}
                nombre={row.nombre}
                activo={row.activo}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
