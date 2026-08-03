import type { Metadata } from "next";

import { es } from "@/messages/es";
import {
  listDocumentos,
  listVersionesByCliente,
} from "@/lib/documentos/queries";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import { getUsuarioDirectory } from "@/lib/admin/directory";
import { DocumentosTable } from "./documentos-table";
import { UploadDocumentoDialog } from "./upload-documento-dialog";

export const metadata: Metadata = {
  title: `${es.documentos.title} · ${es.crm.title} · ${es.common.appName}`,
};

interface DocumentosPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ficha tab 7: Documentos (task 5a.4, spec document-library "Documentos
 * ficha tab (7th tab)" + design Decision 9, the FC8 reversal). Server fetch
 * (`Promise.all`) mirrors the oportunidades tab exactly: `listDocumentos`
 * trust-RLS's the 3-axis gate (cliente + `documentos.ver` + category) and
 * returns an empty list for an unauthorized caller, never an error;
 * `getCatalogoOptions` resolves `categoria_documento` labels (the catalog
 * ships empty per design Decision 8 until an admin adds codes);
 * `getUsuarioDirectory` resolves `subidoPor` display names, the same
 * pattern `bitacora/page.tsx` already established.
 */
export default async function DocumentosPage({ params }: DocumentosPageProps) {
  const { id } = await params;
  const clienteId = Number(id);

  const [documentos, catalogoOptions, directory, versionesByDocumento] =
    await Promise.all([
      listDocumentos(clienteId),
      getCatalogoOptions(),
      getUsuarioDirectory(),
      listVersionesByCliente(clienteId),
    ]);

  const categoriaOptions = activeCatalogoOptions(
    catalogoOptions,
    "categoria_documento",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.documentos.title}</h1>
        <UploadDocumentoDialog
          clienteId={clienteId}
          categoriaOptions={categoriaOptions}
        />
      </div>
      <DocumentosTable
        rows={documentos}
        clienteId={clienteId}
        catalogoOptions={catalogoOptions}
        directory={directory}
        versionesByDocumento={versionesByDocumento}
      />
    </div>
  );
}
