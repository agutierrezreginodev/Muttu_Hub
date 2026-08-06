"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";
import { NotificationList } from "@/components/notificaciones/notification-list";
import type { VencimientoItem } from "@/lib/notificaciones/vencimiento";

interface NotificationBellProps {
  count: number;
  items: VencimientoItem[];
}

/**
 * Due-date bell (slice 10, NB1-NB4).
 *
 * A disclosure built on `Button`, like `UserMenu`: this shadcn install ships
 * no dropdown-menu primitive, and one unlisted component for one menu is not
 * worth the dependency.
 *
 * Count and items are passed in from the server layout — there is no
 * client-side fetching here. The bell reflects what the page render saw, so a
 * completed task disappears on the next navigation rather than lingering
 * until some poll interval catches up.
 *
 * The bell is NOT an inbox. Nothing here is "read" or "dismissed": items are a
 * live query over `v_tarea`, so a row leaves the list by being completed or
 * rescheduled, never by being acknowledged.
 */
export function NotificationBell({ count, items }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${es.notificaciones.label} (${count})`}
        onClick={() => setOpen((previous) => !previous)}
        className="h-11 min-h-11 w-full justify-start gap-2 text-base"
      >
        <span aria-hidden="true">🔔</span>
        <span>{es.notificaciones.label}</span>
        {count > 0 ? (
          <span
            data-testid="notification-count"
            className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums"
          >
            {count}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={es.notificaciones.label}
          className="absolute bottom-full left-0 z-10 mb-2 max-h-96 w-full min-w-72 overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-sh-3"
        >
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            {es.notificaciones.ayuda}
          </p>
          <NotificationList items={items} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
