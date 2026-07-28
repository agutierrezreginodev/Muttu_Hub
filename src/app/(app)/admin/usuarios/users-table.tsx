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
import type { RolOption } from "@/lib/admin/directory";
import type { PermisosOverride } from "@/lib/permissions";
import { EditUserDialog } from "./edit-user-dialog";
import { DeactivateReactivateUserDialog } from "./deactivate-reactivate-user-dialog";

export interface UserRow {
  id: string;
  nombre: string;
  email: string;
  rolId: number;
  rolNombre: string;
  permisosOverride: PermisosOverride;
  activo: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface UsersTableProps {
  rows: UserRow[];
  roles: RolOption[];
}

/** Presentational table (container/presentational pattern) — pure props in, no fetching. */
export function UsersTable({ rows, roles }: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.admin.name}</TableHead>
          <TableHead>{es.admin.email}</TableHead>
          <TableHead>{es.admin.role}</TableHead>
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
            <TableCell>{row.email}</TableCell>
            <TableCell>{row.rolNombre}</TableCell>
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
              <EditUserDialog user={row} roles={roles} />
              <DeactivateReactivateUserDialog
                usuarioId={row.id}
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
