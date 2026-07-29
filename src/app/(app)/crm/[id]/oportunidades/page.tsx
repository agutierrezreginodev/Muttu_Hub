import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listOportunidades } from "@/lib/crm/queries";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import { OportunidadesTable } from "./oportunidades-table";
import { OportunidadFormDialog } from "./oportunidad-form-dialog";

export const metadata: Metadata = {
  title: `${es.crm.tabs.oportunidades} · ${es.crm.title} · ${es.common.appName}`,
};

interface OportunidadesPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 3: Oportunidades (task 7.6, spec OP1-OP5, design Decision 6).
 * `servicioOptions` (active `servicio_interes` codes) feeds the multi-select
 * in the create dialog; `estadoOptions` (active `estado_oportunidad` codes)
 * feeds the optional estado picker.
 */
export default async function OportunidadesPage({
  params,
}: OportunidadesPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [oportunidades, catalogoOptions] = await Promise.all([
    listOportunidades(clienteId),
    getCatalogoOptions(),
  ]);

  const servicioOptions = activeCatalogoOptions(
    catalogoOptions,
    "servicio_interes",
  );
  const estadoOptions = activeCatalogoOptions(
    catalogoOptions,
    "estado_oportunidad",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.crm.tabs.oportunidades}</h1>
        <OportunidadFormDialog
          mode="create"
          clienteId={clienteId}
          servicioOptions={servicioOptions}
          estadoOptions={estadoOptions}
        />
      </div>
      <OportunidadesTable
        rows={oportunidades}
        clienteId={clienteId}
        catalogoOptions={catalogoOptions}
      />
    </div>
  );
}
