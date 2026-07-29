import { notFound } from "next/navigation";

import { getCliente, getProximoCompromiso } from "@/lib/crm/queries";
import { FichaHeader } from "./ficha-header";
import { FichaTabs } from "./ficha-tabs";

interface FichaLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Ficha shell (task 6.8, design UI Structure): fixed header + tab nav,
 * wrapping every `/crm/[id]/*` tab route. Fetches `cliente` (via
 * `getCliente`, `React.cache()`'d) and the próximo compromiso from
 * `v_tarea` ONCE per request — every tab route under this layout reuses the
 * same `getCliente(id)` call instead of re-querying, exactly like
 * `getSessionContext()` dedupes across `(app)/layout.tsx` + its page.
 *
 * `cliente_select` RLS already hides a client a caller cannot see
 * (`has_permission('crm','ver')`) — `getCliente` returning `null` here means
 * either the id does not exist or the caller cannot see it; both render the
 * same 404, exactly like the CRM module gate never reveals which case
 * applies to a non-authorized caller.
 */
export default async function FichaLayout({
  children,
  params,
}: FichaLayoutProps) {
  const { id } = await params;
  const clienteId = Number(id);

  if (!Number.isInteger(clienteId)) {
    notFound();
  }

  const cliente = await getCliente(clienteId);
  if (!cliente) {
    notFound();
  }

  const proximoCompromiso = await getProximoCompromiso(clienteId);

  return (
    <div className="flex flex-col gap-4">
      <FichaHeader
        clienteNombre={cliente.nombre}
        proximoCompromiso={proximoCompromiso}
      />
      <FichaTabs clienteId={clienteId} />
      {children}
    </div>
  );
}
