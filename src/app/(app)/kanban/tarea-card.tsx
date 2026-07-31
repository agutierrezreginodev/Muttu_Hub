import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface KanbanCardData {
  id: number;
  titulo: string;
  responsableLabel: string;
  fechaLimite: string | null;
  prioridad: string | null;
  etiquetas: string[];
  vencido: boolean;
}

interface TareaCardProps {
  tarea: KanbanCardData;
}

/**
 * Card render (slice 4b; design part 2 §12, spec KB4). `vencido` is read
 * DIRECTLY from the `tarea` prop — itself sourced unchanged from
 * `v_tarea.vencido` (`listBoardTareas`, `src/lib/kanban/queries.ts`) — this
 * component never recomputes or re-derives it, mirroring `TareaTable`'s
 * identical rule (`src/app/(app)/crm/[id]/tarea-table.tsx`). Unlike
 * `TareaTable`'s older destructive-title-badge convention, the "Vencida"
 * status here is its OWN separate badge with copy text (not just a color
 * variant on the title) — a deliberate choice so the overdue state is
 * assertable by TEXT, not by CSS class, per the Strict TDD Implementation
 * Detail Coupling Rule.
 *
 * Draggable attributes and the "Mover a…" trigger are deferred to slice 5b,
 * once `moveTareaAction` exists to call.
 */
export function TareaCard({ tarea }: TareaCardProps) {
  return (
    <Card size="sm" data-testid={`tarea-card-${tarea.id}`}>
      <CardHeader>
        <CardTitle>{tarea.titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
        <span>{tarea.responsableLabel}</span>
        <div className="flex flex-wrap items-center gap-1">
          {tarea.vencido ? (
            <Badge variant="destructive">{es.kanban.tarjeta.vencida}</Badge>
          ) : null}
          <Badge variant="outline" data-testid="tarea-fecha-limite">
            {tarea.fechaLimite
              ? new Date(tarea.fechaLimite).toLocaleDateString("es-CO")
              : es.kanban.tarjeta.sinFecha}
          </Badge>
          {tarea.prioridad ? (
            <Badge variant="secondary">{tarea.prioridad}</Badge>
          ) : null}
          {tarea.etiquetas.map((etiqueta) => (
            <Badge key={etiqueta} variant="ghost">
              {etiqueta}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
