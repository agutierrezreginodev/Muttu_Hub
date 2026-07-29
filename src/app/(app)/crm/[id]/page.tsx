import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { es } from "@/messages/es";
import { getCliente } from "@/lib/crm/queries";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import { GeneralTabForm } from "./general-tab-form";

export const metadata: Metadata = {
  title: `${es.crm.tabs.general} · ${es.crm.title} · ${es.common.appName}`,
};

interface GeneralTabPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 1: General (task 6.10, spec FC1). `getCliente(id)` is the same
 * `React.cache()`'d call the ficha shell's `layout.tsx` already made this
 * request — no second round trip. `getCatalogoOptions()` is likewise
 * cache()'d, so it is shared with any other tab that needs a picklist.
 */
export default async function GeneralTabPage({ params }: GeneralTabPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [cliente, catalogoOptions] = await Promise.all([
    getCliente(clienteId),
    getCatalogoOptions(),
  ]);

  if (!cliente) {
    notFound();
  }

  return (
    <GeneralTabForm
      cliente={cliente}
      tamanoOrganizacionOptions={activeCatalogoOptions(
        catalogoOptions,
        "tamano_organizacion",
      )}
      canalContactoInicialOptions={activeCatalogoOptions(
        catalogoOptions,
        "canal_contacto",
      )}
      prioridadOptions={activeCatalogoOptions(catalogoOptions, "prioridad")}
      nivelMadurezOptions={activeCatalogoOptions(
        catalogoOptions,
        "nivel_madurez",
      )}
    />
  );
}
