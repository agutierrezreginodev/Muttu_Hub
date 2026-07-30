import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listTareasRelacionadas } from "@/lib/crm/queries";
import { TareaTable } from "../tarea-table";

export const metadata: Metadata = {
  title: `${es.crm.tabs.tareas} · ${es.crm.title} · ${es.common.appName}`,
};

interface TareasPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 6: Tareas relacionadas (task 8.6, spec FC9). `v_tarea` filtered
 * to `cliente_id` + `origen = 'Kanban'` — READ-ONLY: this is Kanban-origin
 * data, CRM only observes it here, never creates/edits/deletes. No create
 * dialog, no per-row action of any kind.
 */
export default async function TareasPage({ params }: TareasPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const tareas = await listTareasRelacionadas(clienteId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.crm.tabs.tareas}</h1>
      <TareaTable rows={tareas} emptyMessage={es.crm.tareas.noEntries} />
    </div>
  );
}
