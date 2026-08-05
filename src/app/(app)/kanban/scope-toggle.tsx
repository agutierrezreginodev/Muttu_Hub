import Link from "next/link";

import { es } from "@/messages/es";
import {
  BOARD_SCOPES,
  buildScopeHref,
  type BoardScope,
} from "@/lib/kanban/filtros";
import { cn } from "@/lib/utils";

interface ScopeToggleProps {
  scope: BoardScope;
  /** The page's own search params, so flipping scope preserves the rest. */
  params: Record<string, string | undefined>;
}

/**
 * "Mi tablero" / "Equipo completo" (design D10, spec KV2). Plain links, no
 * client state: each choice is a fresh server fetch through RLS, so the narrow
 * scope is a QUERY and not a client-side filter over rows that already reached
 * the browser. Deep-linkable and back-button correct for free.
 *
 * `aria-current="page"` marks the active scope — the styling alone would leave
 * a screen-reader user unable to tell which view they are in.
 */
export function ScopeToggle({ scope, params }: ScopeToggleProps) {
  const options: { value: BoardScope; label: string }[] = [
    { value: BOARD_SCOPES.mio, label: es.kanban.scope.mio },
    { value: BOARD_SCOPES.equipo, label: es.kanban.scope.equipo },
  ];

  return (
    <nav aria-label={es.kanban.scope.label} className="flex gap-1">
      {options.map((option) => {
        const active = option.value === scope;
        return (
          <Link
            key={option.value}
            href={buildScopeHref(params, option.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 min-h-11 items-center rounded-lg px-3 text-sm",
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
