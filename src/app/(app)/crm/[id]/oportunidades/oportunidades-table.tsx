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
import {
  resolveCatalogoLabel,
  activeCatalogoOptions,
  type CatalogoOptionsMap,
} from "@/lib/crm/catalogo-options";
import type { OportunidadListItem } from "@/lib/crm/queries";
import { OportunidadFormDialog } from "./oportunidad-form-dialog";
import { DeleteOportunidadDialog } from "./delete-oportunidad-dialog";

interface OportunidadesTableProps {
  rows: OportunidadListItem[];
  clienteId: number;
  catalogoOptions: CatalogoOptionsMap;
}

/**
 * Presentational oportunidades table (task 7.6, spec OP1-OP5). `estado`
 * and every `servicios_interes` code are resolved via `resolveCatalogoLabel`
 * so a deactivated code still reads correctly for history — the same rule
 * `ContactosTable` applies to `perfilDecision`.
 */
export function OportunidadesTable({
  rows,
  clienteId,
  catalogoOptions,
}: OportunidadesTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.crm.oportunidades.noEntries}
      </p>
    );
  }

  const servicioOptions = activeCatalogoOptions(
    catalogoOptions,
    "servicio_interes",
  );
  const estadoOptions = activeCatalogoOptions(
    catalogoOptions,
    "estado_oportunidad",
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.crm.oportunidades.nombre}</TableHead>
          <TableHead>{es.crm.oportunidades.estado}</TableHead>
          <TableHead>{es.crm.oportunidades.valorEstimadoCop}</TableHead>
          <TableHead>{es.crm.oportunidades.serviciosInteres}</TableHead>
          <TableHead className="text-right">{es.common.edit}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {resolveCatalogoLabel(
                catalogoOptions,
                "estado_oportunidad",
                row.estado,
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.valorEstimadoCop != null
                ? row.valorEstimadoCop.toLocaleString("es-CO")
                : "—"}
            </TableCell>
            <TableCell>
              {row.serviciosInteres.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {row.serviciosInteres.map((codigo) => (
                    <Badge key={codigo} variant="secondary">
                      {resolveCatalogoLabel(
                        catalogoOptions,
                        "servicio_interes",
                        codigo,
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </TableCell>
            <TableCell className="flex justify-end gap-2 text-right">
              <OportunidadFormDialog
                mode="edit"
                clienteId={clienteId}
                oportunidad={row}
                servicioOptions={servicioOptions}
                estadoOptions={estadoOptions}
              />
              <DeleteOportunidadDialog
                clienteId={clienteId}
                oportunidadId={row.id}
                nombre={row.nombre}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
