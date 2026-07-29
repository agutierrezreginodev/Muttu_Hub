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
import { CatalogoFormDialog } from "./catalogo-form-dialog";
import { DeactivateCatalogoDialog } from "./deactivate-catalogo-dialog";

export interface CatalogoRow {
  tipo: string;
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface CatalogoTableProps {
  rows: CatalogoRow[];
}

interface CatalogoGroup {
  tipo: string;
  rows: CatalogoRow[];
}

function groupByTipo(rows: CatalogoRow[]): CatalogoGroup[] {
  const groups = new Map<string, CatalogoRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.tipo);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.tipo, [row]);
    }
  }
  return Array.from(groups.entries()).map(([tipo, tipoRows]) => ({
    tipo,
    rows: tipoRows,
  }));
}

/**
 * Presentational table (container/presentational pattern), grouped by
 * `tipo` (design: "admin catálogos screen ... filterable/grouped by tipo").
 * Reads the BASE `catalogo` table via the server page, so inactive rows are
 * visible here too — deactivating a code never removes it from view.
 */
export function CatalogoTable({ rows }: CatalogoTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.admin.catalogos.noEntries}
      </p>
    );
  }

  const groups = groupByTipo(rows);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.tipo} className="flex flex-col gap-2">
          <h2 className="font-mono text-sm font-semibold text-muted-foreground">
            {group.tipo}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{es.admin.catalogos.codigo}</TableHead>
                <TableHead>{es.admin.catalogos.etiqueta}</TableHead>
                <TableHead>{es.admin.catalogos.orden}</TableHead>
                <TableHead>{es.admin.status}</TableHead>
                <TableHead>{es.admin.createdBy}</TableHead>
                <TableHead>{es.admin.updatedBy}</TableHead>
                <TableHead className="text-right">{es.common.edit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <TableRow key={`${row.tipo}:${row.codigo}`}>
                  <TableCell className="font-medium">{row.codigo}</TableCell>
                  <TableCell>{row.etiqueta}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.orden}
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
                    <CatalogoFormDialog mode="edit" catalogo={row} />
                    {row.activo ? (
                      <DeactivateCatalogoDialog
                        tipo={row.tipo}
                        codigo={row.codigo}
                        etiqueta={row.etiqueta}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
