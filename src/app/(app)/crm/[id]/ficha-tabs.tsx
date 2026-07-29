"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { es } from "@/messages/es";

interface FichaTabsProps {
  clienteId: number;
}

interface FichaTab {
  /** null = the ficha's index route (General). */
  segment: string | null;
  label: string;
}

/**
 * Task 6.9, design Decision 4: nested App Router segments + a `Link` row
 * reading `usePathname()` for active-tab state — NOT the shadcn `tabs`
 * component (the kit ships none). Each tab is a real route, so it is
 * deep-linkable and gets its own server-side fetch (no over-fetching).
 *
 * This PR (6) ships ONLY the General tab — Contactos/Oportunidades (PR7)
 * and Compromisos/Bitácora/Tareas relacionadas (PR8) append their entries
 * here as their route segments land, never as a dead link to a route that
 * does not exist yet (spec FC8 — Documentos MUST NOT be built or stubbed;
 * the same discipline applies to any not-yet-shipped CRM tab).
 */
const TABS: FichaTab[] = [{ segment: null, label: es.crm.tabs.general }];

export function FichaTabs({ clienteId }: FichaTabsProps) {
  const pathname = usePathname();
  const basePath = `/crm/${clienteId}`;

  return (
    <nav className="flex gap-1 border-b" aria-label={es.crm.tabsNav}>
      {TABS.map((tab) => {
        const href = tab.segment ? `${basePath}/${tab.segment}` : basePath;
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-11 min-h-11 items-center border-b-2 px-3 text-sm font-medium",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
