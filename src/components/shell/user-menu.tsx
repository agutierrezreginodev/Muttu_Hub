"use client";

import { useState } from "react";

import { logoutAction } from "@/lib/auth/actions";
import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  nombre: string;
  email: string;
}

/**
 * Minimal accessible user menu. The shadcn kit shipped in PR1
 * (src/components/ui/) does not include a dropdown-menu primitive (spec
 * S7's kit list is button/input/select/textarea/card/badge/dialog/
 * toast/skeleton/table only) — a disclosure built on Button is enough
 * here and avoids adding an unlisted component for one menu item.
 */
export function UserMenu({ nombre, email }: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="flex h-11 min-h-11 w-full items-center gap-2 truncate rounded-lg px-3 text-base text-sidebar-foreground hover:bg-sidebar-accent"
      >
        {nombre}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-10 mb-2 w-full min-w-56 rounded-lg border bg-popover p-2 text-popover-foreground shadow-sh-3"
        >
          <p className="truncate px-2 py-1 text-sm text-muted-foreground">
            {email}
          </p>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              role="menuitem"
              className="h-11 min-h-11 w-full justify-start text-base"
            >
              {es.auth.signOut}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
