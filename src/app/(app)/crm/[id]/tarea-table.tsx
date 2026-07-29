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
import type { TareaListItem } from "@/lib/crm/queries";

interface TareaTableProps {
  rows: TareaListItem[];
  emptyMessage: string;
}

/**
 * Shared presentational table for Compromisos (task 8.5) and Tareas
 * relacionadas (task 8.6) — both are the SAME `v_tarea` shape, partitioned
 * only by `origen` at the query layer (spec FC9, `src/lib/crm/queries.ts`).
 * `titulo` renders in a destructive Badge ONLY when `v_tarea.vencido` is
 * true, read straight from the row — never recomputed, mirroring
 * `FichaHeader`'s identical rule for the próximo compromiso (spec FC7).
 *
 * Renders NO create/edit/delete affordance of its own: Compromisos composes
 * a create dialog in its own `page.tsx` above this table; Tareas
 * relacionadas composes nothing at all — this table has zero interactive
 * controls, by design, for both callers.
 */
export function TareaTable({ rows, emptyMessage }: TareaTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{es.crm.compromisos.titulo}</TableHead>
          <TableHead>{es.crm.compromisos.fechaLimite}</TableHead>
          <TableHead>{es.crm.compromisos.estado}</TableHead>
          <TableHead>{es.crm.compromisos.prioridad}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">
              <Badge
                data-testid={`tarea-titulo-badge-${row.id}`}
                variant={row.vencido ? "destructive" : "secondary"}
              >
                {row.titulo}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.fechaLimite
                ? new Date(row.fechaLimite).toLocaleDateString("es-CO")
                : "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.estado}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.prioridad ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
