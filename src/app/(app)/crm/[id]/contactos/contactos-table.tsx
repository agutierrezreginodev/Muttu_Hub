"use client";

import { es } from "@/messages/es";
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
  type CatalogoOptionsMap,
  activeCatalogoOptions,
} from "@/lib/crm/catalogo-options";
import type { ContactoListItem } from "@/lib/crm/queries";
import { ContactoFormDialog } from "./contacto-form-dialog";
import { DeleteContactoDialog } from "./delete-contacto-dialog";

interface ContactosTableProps {
  rows: ContactoListItem[];
  clienteId: number;
  catalogoOptions: CatalogoOptionsMap;
}

/**
 * Presentational contactos table (task 7.5, spec CO1-CO6). `perfilDecision`
 * is resolved via `resolveCatalogoLabel` so a deactivated code still reads
 * correctly for history (same rule as every other catalog-backed field in
 * this codebase).
 */
export function ContactosTable({
  rows,
  clienteId,
  catalogoOptions,
}: ContactosTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.crm.contactos.noEntries}
      </p>
    );
  }

  const perfilDecisionOptions = activeCatalogoOptions(
    catalogoOptions,
    "perfil_decision",
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.crm.contactos.nombre}</TableHead>
          <TableHead>{es.crm.contactos.cargo}</TableHead>
          <TableHead>{es.crm.contactos.correo}</TableHead>
          <TableHead>{es.crm.contactos.telefono}</TableHead>
          <TableHead>{es.crm.contactos.perfilDecision}</TableHead>
          <TableHead className="text-right">{es.common.edit}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.cargo ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.correo ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.telefono ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {resolveCatalogoLabel(
                catalogoOptions,
                "perfil_decision",
                row.perfilDecision,
              )}
            </TableCell>
            <TableCell className="flex justify-end gap-2 text-right">
              <ContactoFormDialog
                mode="edit"
                clienteId={clienteId}
                contacto={row}
                perfilDecisionOptions={perfilDecisionOptions}
              />
              <DeleteContactoDialog
                clienteId={clienteId}
                contactoId={row.id}
                nombre={row.nombre}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
