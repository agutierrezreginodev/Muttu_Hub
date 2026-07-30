import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listCompromisos } from "@/lib/crm/queries";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import { TareaTable } from "../tarea-table";
import { CompromisoFormDialog } from "./compromiso-form-dialog";

export const metadata: Metadata = {
  title: `${es.crm.tabs.compromisos} · ${es.crm.title} · ${es.common.appName}`,
};

interface CompromisosPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 4: Compromisos (task 8.5, spec FC9, design Decision 9).
 * `v_tarea` filtered to `cliente_id` + `origen in ('CRM','Ambos')` — read +
 * create only, no edit/delete UI in this PR's scope. No new table, no new
 * view: creating a compromiso is a plain `tarea` insert.
 */
export default async function CompromisosPage({
  params,
}: CompromisosPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [compromisos, catalogoOptions] = await Promise.all([
    listCompromisos(clienteId),
    getCatalogoOptions(),
  ]);

  const prioridadOptions = activeCatalogoOptions(catalogoOptions, "prioridad");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.crm.tabs.compromisos}</h1>
        <CompromisoFormDialog
          clienteId={clienteId}
          prioridadOptions={prioridadOptions}
        />
      </div>
      <TareaTable
        rows={compromisos}
        emptyMessage={es.crm.compromisos.noEntries}
      />
    </div>
  );
}
