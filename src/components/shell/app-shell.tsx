"use client";

import { useIdleLogout } from "@/lib/idle/use-idle-logout";
import { es } from "@/messages/es";
import { UserMenu } from "@/components/shell/user-menu";

interface AppShellProps {
  userNombre: string;
  userEmail: string;
  children: React.ReactNode;
}

/**
 * Auth-gated shell (spec S4): responsive nav + user menu, wrapping every
 * page under app/(app)/. Also owns the idle-logout timer (spec A4) — one
 * mount point per authenticated session, regardless of which page is
 * active.
 */
export function AppShell({ userNombre, userEmail, children }: AppShellProps) {
  useIdleLogout();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b px-4">
        <span className="text-base font-semibold">{es.common.appName}</span>
        <nav className="flex items-center gap-2">
          <UserMenu nombre={userNombre} email={userEmail} />
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
