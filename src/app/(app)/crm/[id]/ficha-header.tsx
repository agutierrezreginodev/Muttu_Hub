import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import type { ProximoCompromiso } from "@/lib/crm/queries";

interface FichaHeaderProps {
  clienteNombre: string;
  proximoCompromiso: ProximoCompromiso | null;
}

/**
 * Ficha shell header (task 6.8, spec FC7): shows the cliente's próximo
 * compromiso and renders it visually distinct (destructive/red) ONLY when
 * `v_tarea.vencido` is true for that row. `vencido` is read straight from
 * the `proximoCompromiso` prop (itself sourced from `v_tarea`,
 * src/lib/crm/queries.ts) — this component never recomputes or re-derives
 * it, per FC7's literal requirement.
 */
export function FichaHeader({
  clienteNombre,
  proximoCompromiso,
}: FichaHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b pb-4">
      <h1 className="text-xl font-semibold">{clienteNombre}</h1>
      {proximoCompromiso ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {es.crm.proximoCompromiso}:
          </span>
          <Badge
            data-testid="proximo-compromiso-badge"
            variant={proximoCompromiso.vencido ? "destructive" : "secondary"}
          >
            {proximoCompromiso.titulo}
          </Badge>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{es.crm.sinCompromisos}</p>
      )}
    </header>
  );
}
