import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Kanban module gate (slice 4a; design part 2 §12). Copies
 * `(app)/crm/layout.tsx`'s exact pattern verbatim: a real DB permission
 * check via the `public.has_permission` RPC, never a reimplementation of
 * permission logic in TypeScript. A user without `kanban.ver` is redirected
 * home exactly like the CRM/admin case — no distinct "forbidden" page, so
 * opening `/kanban` never confirms to a non-authorized caller that it
 * exists.
 *
 * Defense in depth, not the only boundary: Kanban is a read of `tarea`,
 * which is already RLS-gated (`tarea_select` requires
 * `has_permission('kanban'|'crm', 'ver')` directly in Postgres depending on
 * `origen` — supabase/migrations/20260728041925_audit.sql), so even a bug
 * in this layout could not leak data.
 */
export default async function KanbanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "kanban",
    accion: "ver",
  });

  if (error || !allowed) {
    redirect("/");
  }

  return <>{children}</>;
}
