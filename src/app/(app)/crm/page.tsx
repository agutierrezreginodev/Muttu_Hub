import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listClientes } from "@/lib/crm/queries";
import { Input } from "@/components/ui/input";
import { ClienteListTable } from "./cliente-list-table";
import { ClienteFormDialog } from "./cliente-form-dialog";

export const metadata: Metadata = {
  title: `${es.crm.title} · ${es.common.appName}`,
};

interface CrmPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Cliente list + search (task 6.7, spec FC6). Search is a plain GET form —
 * no client JS needed for the "search by nombre" requirement — submitting
 * navigates to `/crm?q=...`, which `listClientes(q)` reads server-side.
 * `crm_select` RLS is what actually enforces "empty list, not error" for a
 * caller without `crm.ver`: this page never branches on permissions itself.
 */
export default async function CrmPage({ searchParams }: CrmPageProps) {
  const { q } = await searchParams;
  const clientes = await listClientes(q);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.crm.title}</h1>
        <ClienteFormDialog />
      </div>
      <form method="get" className="max-w-sm">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={es.crm.searchPlaceholder}
          className="h-11 text-base"
        />
      </form>
      <ClienteListTable rows={clientes} />
    </div>
  );
}
