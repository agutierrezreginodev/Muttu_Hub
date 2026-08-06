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
import { PromoteToggle } from "./promote-toggle";

interface CompromisosTableProps {
  rows: TareaListItem[];
  emptyMessage: string;
}

/**
 * The Compromisos tab's own table (slice 9, spec KP2) — the same four columns
 * `TareaTable` renders plus one trailing promote control.
 *
 * A separate component rather than a prop on `TareaTable`, and the duplication
 * is the deliberate cost. `TareaTable` documents "zero interactive controls,
 * by design, for both callers", and its other caller is the READ-ONLY Tareas
 * relacionadas tab. Threading an optional action column through it would make
 * that contract conditional, and a later edit could leak a control into the
 * read-only view without any test noticing. Composition was not available
 * either: `TareaTable` emits a complete `<Table>`, so there is no seam to add
 * a column at without editing it.
 *
 * The `vencido` badge rule is copied verbatim rather than reinterpreted: read
 * straight from `v_tarea.vencido`, never recomputed (spec FC7).
 */
export function CompromisosTable({ rows, emptyMessage }: CompromisosTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{es.crm.compromisos.titulo}</TableHead>
            <TableHead>{es.crm.compromisos.fechaLimite}</TableHead>
            <TableHead>{es.crm.compromisos.estado}</TableHead>
            <TableHead>{es.crm.compromisos.prioridad}</TableHead>
            <TableHead>{es.crm.compromisos.promoteColumn}</TableHead>
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
              <TableCell>
                <PromoteToggle tareaId={row.id} origen={row.origen} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {es.crm.compromisos.promoteAyuda}
      </p>
    </div>
  );
}
