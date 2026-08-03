import { es } from "@/messages/es";

export interface DocumentoUploadResult {
  error?: string;
}

interface PostDocumentoUploadParams {
  clienteId: number;
  file: File;
  /** Present ⇒ add a new version to this existing document. Absent ⇒ create a new document + v1. */
  documentoId?: number;
  /** Required when creating a new document; never sent when adding a version. */
  metadata?: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    tags?: string[];
  };
}

/**
 * POSTs a document upload to the cliente's upload Route Handler (task
 * 5b.2, design Decision 6: byte transport goes through Route Handlers
 * because Server Actions cap request bodies at ~1 MB and are awkward for
 * binary).
 *
 * This is the FIRST client-side `fetch` in this codebase — every other
 * mutation is a Server Action — so the multipart contract is pinned here and
 * in `upload-client.test.ts`, and PR6's `crm/[id]/documentos/upload/route.ts`
 * MUST parse exactly these fields:
 *
 * - `file` — the bytes (always present).
 * - `documentoId` — decimal string. Present ⇒ append the next version via
 *   `add_documento_version`. Absent ⇒ create the parent `documento` + v1.
 * - `nombre`, `categoria` — required when creating; NEVER sent when adding a
 *   version, so a new version can't silently rename or recategorize its
 *   parent (metadata edits go through `updateDocumentoAction` instead).
 * - `descripcion` — omitted entirely when empty.
 * - `tags` — a JSON-encoded string array, so a tag containing a comma
 *   survives the round trip (the edit dialog's comma-separated FIELD is a UI
 *   affordance, not the wire format).
 *
 * Authorization is NOT pre-checked here: the route pre-checks the verb and
 * Postgres RLS (`cliente_visible` AND `has_permission` AND
 * `categoria_visible`) is the real boundary. This helper only relays whatever
 * message the route returns, so the route owns the wording (e.g. a denied
 * category) — and it never throws, mirroring the action-state convention
 * (`{ error }`, surfaced inline) that every Server Action here follows.
 */
export async function postDocumentoUpload({
  clienteId,
  file,
  documentoId,
  metadata,
}: PostDocumentoUploadParams): Promise<DocumentoUploadResult> {
  const body = new FormData();
  body.set("file", file);

  if (documentoId != null) {
    body.set("documentoId", String(documentoId));
  }

  if (metadata) {
    body.set("nombre", metadata.nombre);
    body.set("categoria", metadata.categoria);
    if (metadata.descripcion) {
      body.set("descripcion", metadata.descripcion);
    }
    body.set("tags", JSON.stringify(metadata.tags ?? []));
  }

  try {
    const response = await fetch(`/crm/${clienteId}/documentos/upload`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return { error: payload.error ?? es.common.genericError };
    }

    return {};
  } catch {
    // A network fault must read like any other failed mutation, not an
    // unhandled rejection in a transition.
    return { error: es.common.genericError };
  }
}
