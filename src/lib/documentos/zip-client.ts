import { es } from "@/messages/es";

export interface DocumentoZipResult {
  error?: string;
}

interface RequestDocumentoZipParams {
  clienteId: number;
  documentoIds: number[];
}

/**
 * Requests a zip of the selected documents and hands it to the browser as a
 * download (task 6.6, spec document-zip-export).
 *
 * The export is a POST — the selection is a body, not a URL — so it cannot be a
 * plain link and the response has to be turned into a download by hand: read the
 * blob, point a synthetic anchor at an object URL, click it, then revoke.
 *
 * A `204` is NOT a failure on the server's side: it means nothing in the
 * selection was visible to this caller (RLS excluded all of it), which the route
 * answers with no body rather than an empty archive some clients report as
 * corrupt. The user still needs to hear that nothing downloaded, hence its own
 * message. Every other non-ok response relays the route's own wording, so cap
 * refusals read correctly without duplicating the limits here.
 */
export async function requestDocumentoZip({
  clienteId,
  documentoIds,
}: RequestDocumentoZipParams): Promise<DocumentoZipResult> {
  if (documentoIds.length === 0) {
    return { error: es.documentos.zip.noSelectionError };
  }

  try {
    const response = await fetch(`/crm/${clienteId}/documentos/descargar-zip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentoIds }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return { error: payload.error ?? es.common.genericError };
    }

    if (response.status === 204) {
      return { error: es.documentos.zip.emptyResultError };
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `documentos-${clienteId}.zip`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);

    return {};
  } catch {
    return { error: es.common.genericError };
  }
}
