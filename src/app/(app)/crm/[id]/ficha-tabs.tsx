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
 * PR6 shipped ONLY the General tab; PR7 appended Contactos/Oportunidades;
 * PR8 appends Compromisos/Bitácora/Tareas relacionadas here, completing the
 * FULL 6-tab set spec FC8 requires (General, Contactos, Oportunidades,
 * Compromisos, Bitácora, Tareas relacionadas) — never as a dead link to a
 * route that does not exist yet. A Documentos tab MUST NOT be built or
 * stubbed anywhere in this change (spec FC8, out of scope per proposal) —
 * this array is the single place a 7th tab could slip in, so it stays
 * exactly 6 entries.
 */
const TABS: FichaTab[] = [
  { segment: null, label: es.crm.tabs.general },
  { segment: "contactos", label: es.crm.tabs.contactos },
  { segment: "oportunidades", label: es.crm.tabs.oportunidades },
  { segment: "compromisos", label: es.crm.tabs.compromisos },
  { segment: "bitacora", label: es.crm.tabs.bitacora },
  { segment: "tareas", label: es.crm.tabs.tareas },
];

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
