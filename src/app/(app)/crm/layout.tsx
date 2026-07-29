import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * CRM module gate (task 6.6, spec §4.2). Copies `(app)/admin/layout.tsx`'s
 * exact pattern: a real DB permission check via the `public.has_permission`
 * RPC, never a reimplementation of permission logic in TypeScript. A user
 * without `crm.ver` is redirected home exactly like the non-admin case — no
 * distinct "forbidden" page, so opening `/crm` never confirms to a
 * non-authorized caller that it exists.
 *
 * Defense in depth, not the only boundary: `cliente`/`tarea`/`contacto`/
 * `oportunidad`/`bitacora_cliente` are all RLS-gated too (`cliente_select`
 * requires `has_permission('crm','ver')` directly in Postgres), so even a
 * bug in this layout could not leak data — see spec FC6's empty-list
 * requirement, enforced independently by `listClientes()`.
 */
export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "crm",
    accion: "ver",
  });

  if (error || !allowed) {
    redirect("/");
  }

  return <>{children}</>;
}
