import { es } from "@/messages/es";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TimelineListItem {
  id: string | number;
  typeLabel: string;
  title: string;
  subtitle?: string;
  timestampLabel: string;
}

interface TimelineListProps {
  items: TimelineListItem[];
  className?: string;
}

/**
 * Timeline list primitive (PR-1 task 1.10; design.md §5 chart-type mapping —
 * Actividad's "recent activity" is a list, not a chart). Renders items in
 * the given order: type badge + title + optional subtitle + relative time.
 */
export function TimelineList({ items, className }: TimelineListProps) {
  if (items.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="timeline-list-empty"
      >
        {es.dashboard.charts.emptyState}
      </p>
    );
  }

  return (
    <ul
      className={cn("flex flex-col gap-3", className)}
      data-slot="timeline-list"
    >
      {items.map((item) => (
        <li
          key={item.id}
          data-testid={`timeline-list-item-${item.id}`}
          className="flex items-start gap-2 border-b border-border pb-2 last:border-b-0"
        >
          <Badge variant="outline">{item.typeLabel}</Badge>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {item.title}
            </span>
            {item.subtitle ? (
              <span className="text-xs text-muted-foreground">
                {item.subtitle}
              </span>
            ) : null}
          </div>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {item.timestampLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}
