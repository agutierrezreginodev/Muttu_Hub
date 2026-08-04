import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { es } from "@/messages/es";
import { DashboardTabs } from "./dashboard-tabs";

/**
 * Dashboard module gate (task 2.5, design.md §2 Decision 3): a byte-for-byte
 * copy of `(app)/crm/layout.tsx`'s pattern — a real DB permission check via
 * the `public.has_permission` RPC, never a reimplementation of permission
 * logic in TypeScript. A user without `dashboard.ver` is redirected home
 * exactly like the CRM/Admin gate — no distinct "forbidden" page, so opening
 * `/dashboard` never confirms to a non-authorized caller that it exists.
 *
 * Defense in depth, not the only boundary: each face's aggregation view is
 * additionally filtered by the underlying domain RLS (design.md §2), so even
 * a bug in this layout could not leak data a viewer's RLS would otherwise
 * hide.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "dashboard",
    accion: "ver",
  });

  if (error || !allowed) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.dashboard.title}</h1>
      <DashboardTabs />
      {children}
    </div>
  );
}
