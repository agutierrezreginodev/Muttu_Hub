"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { es } from "@/messages/es";

interface DashboardTab {
  /** null = the dashboard's index route (Pipeline). */
  segment: string | null;
  label: string;
}

/**
 * Dashboard tab nav (task 2.5, design.md §3 Decision 4): a `Link` row
 * reading `usePathname()`, copying `ficha-tabs.tsx`'s exact shape — NOT the
 * shadcn `tabs` component (the kit ships none). `DASHBOARD_TABS` is the
 * SINGLE place a tab is added; a tab is NEVER appended before its route
 * exists (same dead-link guard `ficha-tabs.tsx` documents). PR-2 shipped
 * Pipeline; PR-3 appends Actividad; PR-4 appends Tareas. Mi Resumen is
 * appended here now that `mi-resumen/page.tsx` exists — until this PR the
 * label existed in `es.dashboard.tabs` but the route did not, which is
 * exactly the state that dead-link guard is there to prevent.
 */
export const DASHBOARD_TABS: DashboardTab[] = [
  { segment: null, label: es.dashboard.tabs.pipeline },
  { segment: "actividad", label: es.dashboard.tabs.actividad },
  { segment: "tareas", label: es.dashboard.tabs.tareas },
  { segment: "mi-resumen", label: es.dashboard.tabs.miResumen },
];

export function DashboardTabs() {
  const pathname = usePathname();
  const basePath = "/dashboard";

  return (
    <nav className="flex gap-0.5 border-b" aria-label={es.dashboard.title}>
      {DASHBOARD_TABS.map((tab) => {
        const href = tab.segment ? `${basePath}/${tab.segment}` : basePath;
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center px-[15px] py-[10px] text-[13.5px] font-semibold text-ink-600 hover:text-ink-950",
              isActive &&
                "text-rose-700 after:absolute after:right-[11px] after:bottom-[-1px] after:left-[11px] after:h-[3px] after:rounded-t-full after:bg-rose-500 after:content-['']",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
