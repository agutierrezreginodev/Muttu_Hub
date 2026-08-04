import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { STATUS_COLORS, type StatusKey } from "./palette";

interface KpiTileProps {
  label: string;
  value: string | number;
  /** Reserved status meaning only (design.md §5 Decision 6) — never a generic categorical hue. */
  status?: StatusKey;
  statusLabel?: string;
  /**
   * Optional icon rendered alongside `statusLabel` (spec dashboard-tareas:
   * the overdue tile uses "an icon + label, never color alone"). Only
   * rendered together with `status`/`statusLabel` — never on its own.
   */
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  className?: string;
}

/**
 * KPI stat tile primitive (PR-1 task 1.4; design.md §5 Decision 5). A single
 * headline number — not a chart. `status`/`statusLabel` are used for
 * overdue/due-soon/on-track/informational callouts (e.g. Tareas' "Vencidas"
 * tile) and always render together (a status color alone never carries
 * meaning without its label).
 */
export function KpiTile({
  label,
  value,
  status,
  statusLabel,
  icon: Icon,
  loading = false,
  className,
}: KpiTileProps) {
  const statusColor = status ? STATUS_COLORS[status] : null;

  return (
    <Card size="sm" data-slot="kpi-tile" className={cn("gap-1", className)}>
      <CardContent className="flex flex-col gap-1">
        {loading ? (
          <div data-testid="kpi-tile-skeleton" className="flex flex-col gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <span className="font-heading text-2xl font-semibold text-foreground">
              {value}
            </span>
            <span className="text-sm text-muted-foreground">{label}</span>
            {status && statusLabel ? (
              <span
                data-testid="kpi-tile-status"
                className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  color: statusColor?.fg,
                  backgroundColor: statusColor?.bg,
                }}
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                {statusLabel}
              </span>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
