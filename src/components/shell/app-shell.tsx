"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useIdleLogout } from "@/lib/idle/use-idle-logout";
import { es } from "@/messages/es";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell } from "@/components/notificaciones/notification-bell";
import type { VencimientoItem } from "@/lib/notificaciones/vencimiento";

/**
 * Nav link with the brand "riel" active-state indicator: a 3px rose-500
 * pill bar at the sidebar's edge, plus rose-50/rose-700 active colors.
 * The riel sits at left:-18px, matching the sidebar's own 18px padding.
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
        "relative flex h-11 min-h-11 w-full items-center rounded-lg px-3 text-base text-sidebar-foreground hover:bg-sidebar-accent",
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
  /** UX only (task 2.6) — hides/shows the Dashboard link. Never the real gate: the actual gate is (app)/dashboard/layout.tsx's has_permission() RPC plus every domain RLS policy each face's aggregation view reads through. */
  canAccessDashboard: boolean;
  /**
   * Due and nearly-due tareas for the current user (slice 10), fetched by the
   * server layout. Passed down rather than fetched in the bell so the shell
   * stays a single render pass with no client-side data loading.
   */
  vencimientos: VencimientoItem[];
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
  canAccessDashboard,
  vencimientos,
  children,
}: AppShellProps) {
  useIdleLogout();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col min-[860px]:flex-row">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar px-[18px] pt-7 pb-6",
          "min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen min-[860px]:w-[264px]",
          "min-[860px]:overflow-y-auto min-[860px]:border-b-0 min-[860px]:border-r min-[860px]:pb-10",
        )}
      >
        <div className="mb-6 flex items-center gap-[11px]">
          <Logo className="h-8 w-auto shrink-0" />
          <div className="font-display text-sm leading-tight font-bold text-sidebar-foreground">
            {es.common.appName}
            <span className="mt-0.5 block text-[11px] font-medium tracking-[.09em] text-ink-500 uppercase">
              Plataforma interna
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Secciones">
          <NavLink href="/" active={pathname === "/"}>
            {es.home.nav}
          </NavLink>
          {canAccessCrm ? (
            <NavLink href="/crm" active={pathname.startsWith("/crm")}>
              {es.crm.nav}
            </NavLink>
          ) : null}
          {canAccessKanban ? (
            <NavLink href="/kanban" active={pathname.startsWith("/kanban")}>
              {es.kanban.nav}
            </NavLink>
          ) : null}
          {canAccessDashboard ? (
            <NavLink
              href="/dashboard"
              active={pathname.startsWith("/dashboard")}
            >
              {es.dashboard.nav}
            </NavLink>
          ) : null}
          {canAccessAdmin ? (
            <NavLink href="/admin" active={pathname.startsWith("/admin")}>
              {es.admin.nav}
            </NavLink>
          ) : null}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-3 min-[860px]:mt-6">
          <NotificationBell
            count={vencimientos.length}
            items={vencimientos}
          />
          <UserMenu nombre={userNombre} email={userEmail} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 min-[860px]:px-14 min-[860px]:pt-13 min-[860px]:pb-30">
        {children}
      </main>
    </div>
  );
}
