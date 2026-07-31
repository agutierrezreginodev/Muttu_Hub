"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useIdleLogout } from "@/lib/idle/use-idle-logout";
import { es } from "@/messages/es";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";

/**
 * Nav link with the brand "riel" active-state indicator: a 3px rose-500
 * pill bar to the left of the link, plus rose-50/rose-700 active colors.
 */
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-11 min-h-11 items-center rounded-lg px-3 text-base hover:bg-muted",
        active &&
          "font-semibold text-rose-700 bg-rose-50 hover:bg-rose-50 before:absolute before:top-1/2 before:left-[-18px] before:h-[19px] before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-rose-500 before:content-['']",
      )}
    >
      {children}
    </Link>
  );
}

interface AppShellProps {
  userNombre: string;
  userEmail: string;
  /** UX only (task 4.1) — hides/shows the Admin link. Never the real gate. */
  canAccessAdmin: boolean;
  /** UX only (task 6.11) — hides/shows the CRM link. Never the real gate: the actual gate is (app)/crm/layout.tsx's has_permission() RPC plus every RLS policy under that module. */
  canAccessCrm: boolean;
  /** UX only (slice 4a) — hides/shows the Kanban link. Never the real gate: the actual gate is (app)/kanban/layout.tsx's has_permission() RPC plus every RLS policy on tarea and its child tables. */
  canAccessKanban: boolean;
  children: React.ReactNode;
}

/**
 * Auth-gated shell (spec S4): responsive nav + user menu, wrapping every
 * page under app/(app)/. Also owns the idle-logout timer (spec A4) — one
 * mount point per authenticated session, regardless of which page is
 * active.
 */
export function AppShell({
  userNombre,
  userEmail,
  canAccessAdmin,
  canAccessCrm,
  canAccessKanban,
  children,
}: AppShellProps) {
  useIdleLogout();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-auto" />
          <span className="text-base font-semibold">{es.common.appName}</span>
        </div>
        <nav className="flex items-center gap-2">
          {canAccessCrm ? (
            <NavLink href="/crm" active={pathname.startsWith("/crm")}>
              {es.crm.nav}
            </NavLink>
          ) : null}
          {canAccessKanban ? (
            <Link
              href="/kanban"
              className="flex h-11 min-h-11 items-center rounded-lg px-3 text-base hover:bg-muted"
            >
              {es.kanban.nav}
            </Link>
          ) : null}
          {canAccessAdmin ? (
            <NavLink href="/admin" active={pathname.startsWith("/admin")}>
              {es.admin.nav}
            </NavLink>
          ) : null}
          <UserMenu nombre={userNombre} email={userEmail} />
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
