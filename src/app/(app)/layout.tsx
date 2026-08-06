import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session/get-session-context";
import { hasPermission } from "@/lib/permissions";
import { getVencimientos } from "@/lib/notificaciones/queries";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Auth-gated shell layout (spec S4). middleware.ts already redirects
 * unauthenticated requests before they reach here (spec A5); this re-check
 * is defense in depth, not the security boundary — Postgres RLS is
 * (design decision "Security boundary"). Data access below stays
 * RLS-gated even if this check were ever bypassed.
 *
 * `canAccessAdmin` only controls whether the shell SHOWS the Admin nav
 * link (UX, task 4.1's UI-side permissions merge) — it is not the gate.
 * The actual gate is (app)/admin/layout.tsx's has_permission() RPC call
 * plus every RLS policy under that module.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sessionContext = await getSessionContext();
  const canAccessAdmin = sessionContext
    ? hasPermission(sessionContext.permisos, "admin", "ver")
    : false;
  const canAccessCrm = sessionContext
    ? hasPermission(sessionContext.permisos, "crm", "ver")
    : false;
  const canAccessKanban = sessionContext
    ? hasPermission(sessionContext.permisos, "kanban", "ver")
    : false;
  const canAccessDashboard = sessionContext
    ? hasPermission(sessionContext.permisos, "dashboard", "ver")
    : false;

  // Slice 10. Fetched here, in the layout, so the bell is server-rendered on
  // every page rather than fetching for itself on the client. RLS decides
  // what `v_tarea` returns, so a caller without kanban/crm visibility simply
  // gets an empty list — no permission flag gates this, and none should:
  // the rows are the caller's OWN tareas.
  const vencimientos = sessionContext
    ? await getVencimientos(sessionContext.userId)
    : [];

  return (
    <AppShell
      userNombre={sessionContext?.nombre ?? user.email ?? ""}
      userEmail={sessionContext?.email ?? user.email ?? ""}
      canAccessAdmin={canAccessAdmin}
      canAccessCrm={canAccessCrm}
      canAccessKanban={canAccessKanban}
      canAccessDashboard={canAccessDashboard}
      vencimientos={vencimientos}
    >
      {children}
    </AppShell>
  );
}
