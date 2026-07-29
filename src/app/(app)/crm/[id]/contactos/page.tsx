import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listContactos } from "@/lib/crm/queries";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import { ContactosTable } from "./contactos-table";
import { ContactoFormDialog } from "./contacto-form-dialog";

export const metadata: Metadata = {
  title: `${es.crm.tabs.contactos} · ${es.crm.title} · ${es.common.appName}`,
};

interface ContactosPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 2: Contactos (task 7.5, spec CO1-CO6). `getCatalogoOptions()` is
 * the same `React.cache()`'d call the General tab already made this
 * request, so this adds no extra round trip beyond the two reads
 * `listContactos` itself needs.
 */
export default async function ContactosPage({ params }: ContactosPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [contactos, catalogoOptions] = await Promise.all([
    listContactos(clienteId),
    getCatalogoOptions(),
  ]);

  const perfilDecisionOptions = activeCatalogoOptions(
    catalogoOptions,
    "perfil_decision",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.crm.tabs.contactos}</h1>
        <ContactoFormDialog
          mode="create"
          clienteId={clienteId}
          perfilDecisionOptions={perfilDecisionOptions}
        />
      </div>
      <ContactosTable
        rows={contactos}
        clienteId={clienteId}
        catalogoOptions={catalogoOptions}
      />
    </div>
  );
}
