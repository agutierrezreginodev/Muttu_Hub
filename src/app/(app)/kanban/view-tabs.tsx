import Link from "next/link";

import { es } from "@/messages/es";
import { buildBoardHref, type SearchParamsRecord } from "@/lib/kanban/filtros";
import { cn } from "@/lib/utils";

export const BOARD_PATH = "/kanban";
export const LISTA_PATH = "/kanban/lista";
export const REPORTES_PATH = "/kanban/reportes";

interface KanbanViewTabsProps {
  /** The path currently rendering, so the active tab is not guessed. */
  current: string;
  params: SearchParamsRecord;
}

/**
 * Board / list switch (spec KV1). Both hrefs carry the CURRENT filters and
 * scope: KV1 is "the same rows, two presentations", so losing them here would
 * make the two views show different data and turn the switch into a reset
 * button.
 *
 * The active tab is passed in rather than read from `usePathname`, which keeps
 * this a server component — no client bundle for two links.
 */
export function KanbanViewTabs({ current, params }: KanbanViewTabsProps) {
  const views = [
    { path: BOARD_PATH, label: es.kanban.lista.tablero },
    { path: LISTA_PATH, label: es.kanban.lista.nav },
    { path: REPORTES_PATH, label: es.kanban.reportes.nav },
  ];

  return (
    <nav aria-label={es.kanban.lista.viewsLabel} className="flex gap-1">
      {views.map((view) => {
        const active = view.path === current;
        return (
          <Link
            key={view.path}
            href={buildBoardHref(view.path, params)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 min-h-11 items-center rounded-lg px-3 text-sm",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
