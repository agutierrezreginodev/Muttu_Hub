import Link from "next/link";
import { ListChecks } from "lucide-react";

import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One list row — labels already resolved server-side, ids kept for linking. */
export interface TareaListRow {
  id: number;
  titulo: string;
  responsableLabel: string;
  clienteLabel: string | null;
  columnaLabel: string;
  fechaLimite: string | null;
  prioridad: string | null;
  etiquetas: string[];
  vencido: boolean;
}

interface TareaListTableProps {
  rows: TareaListRow[];
}

const DASH = "—";

/**
 * The board's rows as a table (spec KV1). Purely presentational: it renders
 * whatever `listBoardTareas` returned under the same filters and scope the board
 * uses, so "same rows, two presentations" holds by construction. Zero rows is
 * rendered the same way whether a filter matched nothing or RLS showed the
 * caller nothing — this component never branches on permissions.
 *
 * `vencido` comes straight from the prop (sourced from `v_tarea.vencido`) and is
 * never recomputed here, the same rule `TareaCard` follows.
 *
 * The `columna` label is a column of its own: without it the table would be
 * blind to where a card actually sits on the board.
 */
export function TareaListTable({ rows }: TareaListTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="size-6" />}
        title={es.kanban.lista.emptyState}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.kanban.tarjeta.titulo}</TableHead>
          <TableHead>{es.kanban.tarjeta.responsable}</TableHead>
          <TableHead>{es.kanban.filtros.cliente}</TableHead>
          <TableHead>{es.kanban.lista.columna}</TableHead>
          <TableHead>{es.kanban.tarjeta.fechaLimite}</TableHead>
          <TableHead>{es.kanban.tarjeta.prioridad}</TableHead>
          <TableHead>{es.kanban.tarjeta.etiquetas}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Link href={`/kanban/${row.id}`} className="hover:underline">
                {row.titulo}
              </Link>
              {row.vencido ? (
                <Badge variant="destructive" className="ml-2">
                  {es.kanban.tarjeta.vencida}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.responsableLabel}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.clienteLabel ?? DASH}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.columnaLabel}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.fechaLimite
                ? new Date(row.fechaLimite).toLocaleDateString("es-CO")
                : DASH}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.prioridad ?? DASH}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.etiquetas.length === 0 ? (
                DASH
              ) : (
                <span className="flex flex-wrap gap-1">
                  {row.etiquetas.map((etiqueta) => (
                    <Badge key={etiqueta} variant="ghost">
                      {etiqueta}
                    </Badge>
                  ))}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
