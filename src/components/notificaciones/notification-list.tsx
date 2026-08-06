import Link from "next/link";

import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import { hrefFor } from "@/lib/notificaciones/href";
import type { VencimientoItem } from "@/lib/notificaciones/vencimiento";

interface NotificationListProps {
  items: VencimientoItem[];
  /** Closes the disclosure after a link is followed. */
  onNavigate?: () => void;
}

/**
 * The bell's contents (slice 10).
 *
 * Overdue and due-soon are distinguished by a TEXT badge, not by colour alone
 * — the same rule the board's "Vencida" badge follows, and the reason both are
 * assertable by text rather than by class.
 *
 * Sorted by `fechaLimite` ascending, so the most urgent row is first. The
 * query already orders this way; sorting again here keeps the component
 * correct on any input rather than dependent on its caller.
 */
export function NotificationList({ items, onNavigate }: NotificationListProps) {
  if (items.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        {es.notificaciones.emptyState}
      </p>
    );
  }

  const ordered = [...items].sort((a, b) =>
    a.fechaLimite.localeCompare(b.fechaLimite),
  );

  return (
    <ul className="flex flex-col">
      {ordered.map((item) => {
        const vencida = item.estado === "vencido";
        return (
          <li key={item.id}>
            <Link
              href={hrefFor(item)}
              onClick={onNavigate}
              className="flex min-h-11 flex-col gap-1 rounded-md px-2 py-2 hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <Badge variant={vencida ? "destructive" : "secondary"}>
                  {vencida
                    ? es.notificaciones.vencida
                    : es.notificaciones.vencePronto}
                </Badge>
                <span className="min-w-0 truncate text-sm font-medium">
                  {item.titulo}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.fechaLimite).toLocaleDateString("es-CO")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
