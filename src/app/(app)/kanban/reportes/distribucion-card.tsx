import { es } from "@/messages/es";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface DistribucionCardItem {
  /** Raw bucket key — kept for a stable React key when labels collide. */
  clave: string;
  /** Display label, already resolved by the page from its catalogs. */
  etiqueta: string;
  total: number;
}

interface DistribucionCardProps {
  titulo: string;
  items: DistribucionCardItem[];
  /** Optional note explaining a distribution's counting rule. */
  ayuda?: string;
}

/**
 * One distribution, rendered as a labelled list (slice 8, spec KR1).
 *
 * A single parameterised card rather than the four near-identical
 * `*-report-card.tsx` files the checklist sketched: the four distributions
 * differ only in their title, their labels and one optional note, and label
 * resolution belongs to the page that owns the catalogs anyway.
 *
 * Deliberately NOT built on `components/dashboard/charts/KpiTile`. That tile
 * is a fine primitive, but it carries the dashboard's status palette and its
 * design decisions; importing it here would tie the kanban module to the
 * dashboard's for the sake of a rounded box.
 *
 * A list, not a table: these are label/count pairs with no second dimension,
 * and no row here is navigable. No export control anywhere (KR2).
 */
export function DistribucionCard({
  titulo,
  items,
  ayuda,
}: DistribucionCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {es.kanban.reportes.emptyState}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={item.clave}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="min-w-0 truncate text-sm">
                  {item.etiqueta}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {item.total}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ayuda ? (
          <p className="text-xs text-muted-foreground">{ayuda}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
