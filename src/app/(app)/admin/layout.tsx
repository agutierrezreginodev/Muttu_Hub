import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Admin module gate (spec U1: "Admin module only for Administrador"; task
 * 4.2). Calls the real DB permission function via the public.has_permission
 * RPC (supabase/migrations/20260728060000_admin_permission_wrapper.sql) —
 * this deliberately does NOT reimplement permission logic in TypeScript.
 * Non-admins are redirected home exactly like the unauthenticated case in
 * (app)/layout.tsx: no distinct "forbidden" page, so opening the admin URL
 * never confirms to a non-admin that it exists (spec scenario "Non-admin:
 * WHEN Colaborador opens admin URL THEN denied").
 *
 * Defense in depth, not the only boundary: every table under /admin is
 * also RLS-gated (rol/usuario policies require has_permission('admin', ...)
 * directly in Postgres), so even a bug in this layout could not leak data.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "admin",
    accion: "ver",
  });

  if (error || !allowed) {
    redirect("/");
  }

  return <>{children}</>;
}
