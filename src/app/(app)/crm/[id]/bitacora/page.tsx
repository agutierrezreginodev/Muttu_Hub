import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listBitacora } from "@/lib/crm/queries";
import { getUsuarioDirectory } from "@/lib/admin/directory";
import { BitacoraFeed } from "./bitacora-feed";
import { BitacoraForm } from "./bitacora-form";

export const metadata: Metadata = {
  title: `${es.crm.tabs.bitacora} · ${es.crm.title} · ${es.common.appName}`,
};

interface BitacoraPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 5: Bitácora (task 8.4, spec BIT1-BIT6). Append-only feed,
 * newest-first (matches `bitacora_cliente_idx (cliente_id, created_at
 * desc)`) + a create-only textarea form. NO edit/delete affordance renders
 * anywhere in this tree — spec BIT5 is a hard requirement (corrections to
 * an entry are new rows, never an edit), not a stylistic choice.
 */
export default async function BitacoraPage({ params }: BitacoraPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [entradas, directory] = await Promise.all([
    listBitacora(clienteId),
    getUsuarioDirectory(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.crm.tabs.bitacora}</h1>
      <BitacoraForm clienteId={clienteId} />
      <BitacoraFeed rows={entradas} directory={directory} />
    </div>
  );
}
