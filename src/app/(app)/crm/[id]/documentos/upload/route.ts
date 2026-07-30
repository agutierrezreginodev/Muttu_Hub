import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import type { Accion, Modulo } from "@/lib/permissions";
import {
  documentoMetadataSchema,
  documentoUploadMetadataSchema,
} from "@/lib/documentos/schemas";
import {
  buildDocumentoStoragePath,
  sanitizeStorageFilename,
} from "@/lib/documentos/storage-paths";

/**
 * Node runtime: this handler moves bytes and uses `FormData`/`File`, neither of
 * which belongs on the Edge runtime here (design Decision 6).
 */
export const runtime = "nodejs";

const BUCKET = "documentos";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function denied() {
  return Response.json({ error: es.common.genericError }, { status: 403 });
}

/**
 * Upload a document (task 6.1/6.2, spec document-library "Upload a document" +
 * document-versioning "Adding a version"). One route serves BOTH shapes, told
 * apart by `documentoId`, exactly as `postDocumentoUpload` documents on the
 * client side:
 *
 * - absent ⇒ create the parent `documento` row, then its version 1;
 * - present ⇒ append the next version to an existing document.
 *
 * Both are gated on `documentos.crear`. That is not a guess: `add_documento_version`
 * itself raises 42501 unless `cliente_visible AND has_permission('documentos','crear')
 * AND categoria_visible`, so pre-checking any other verb here would let a request
 * through that the database then rejects. This pre-check is only the earlier,
 * friendlier gate — RLS remains the real boundary, and this handler uses the
 * caller's RLS-gated client, never the service role.
 *
 * ORDERING: parent row (if any) → bytes → version row. Bytes must land before
 * the version row, or a `documento_version` would point at an object that does
 * not exist and downloads would 404. The cost of that order is an ORPHANED
 * object whenever the version RPC fails after a successful upload (a lost race
 * on `unique(documento_id, version)`, or a grant revoked mid-request). The
 * handler cannot clean it up: PR3 deliberately gives `authenticated` no DELETE
 * policy on `storage.objects`. Orphans are therefore expected and harmless
 * (invisible without a version row) but do consume storage — this is exactly
 * open question 5 (orphan-cleanup job), still unresolved by the owner.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return badRequest(es.common.genericError);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return badRequest(es.common.requiredField);
  }

  const uploadShape = documentoUploadMetadataSchema.safeParse({
    originalFilename: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
  });
  if (!uploadShape.success) {
    return badRequest(
      uploadShape.error.issues[0]?.message ?? es.common.genericError,
    );
  }

  const documentoIdRaw = form.get("documentoId");
  const isNewVersion = typeof documentoIdRaw === "string";

  // Parsed BEFORE the permission round trip so a malformed request never costs
  // a query, and before any bytes move either way.
  let metadata: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    tags: string[];
  } | null = null;

  if (!isNewVersion) {
    let tags: unknown = [];
    const rawTags = form.get("tags");
    if (typeof rawTags === "string" && rawTags.length > 0) {
      try {
        tags = JSON.parse(rawTags);
      } catch {
        return badRequest(es.common.genericError);
      }
    }

    const parsed = documentoMetadataSchema.safeParse({
      nombre: form.get("nombre"),
      categoria: form.get("categoria"),
      descripcion: form.get("descripcion") ?? undefined,
      tags,
    });
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message ?? es.common.genericError,
      );
    }
    metadata = {
      nombre: parsed.data.nombre,
      categoria: parsed.data.categoria,
      descripcion: parsed.data.descripcion,
      tags: parsed.data.tags,
    };
  }

  const supabase = await createClient();
  const { data: allowed, error: permissionError } = await supabase.rpc(
    "has_permission",
    {
      modulo: "documentos" satisfies Modulo,
      accion: "crear" satisfies Accion,
    },
  );
  if (permissionError || !allowed) {
    return denied();
  }

  let documentoId: number;
  let version: number;

  if (isNewVersion) {
    documentoId = Number(documentoIdRaw);
    if (!Number.isInteger(documentoId) || documentoId <= 0) {
      return badRequest(es.common.genericError);
    }

    // The RPC recomputes `max(version) + 1` itself; this read only builds the
    // storage path, which must contain the version before the bytes move. The
    // two can disagree under a concurrent upload — then the RPC's
    // `unique(documento_id, version)` rejects this request (spec
    // document-versioning "Concurrent uploads do not collide silently") and the
    // caller retries. An invisible document reads as zero versions here and is
    // rejected by the RPC's own gate, never by trusting this count.
    const { data: latest } = await supabase
      .from("documento_version")
      .select("version")
      .eq("documento_id", documentoId)
      .order("version", { ascending: false })
      .limit(1);
    version = (latest?.[0]?.version ?? 0) + 1;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("documento")
      .insert({
        cliente_id: clienteId,
        nombre: metadata!.nombre,
        categoria: metadata!.categoria,
        descripcion: metadata!.descripcion ?? null,
        tags: metadata!.tags,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      // `documento_insert`'s WITH CHECK denies an ungranted category here, so
      // this is the path that surfaces a category denial for a new document.
      return Response.json(
        { error: es.documentos.upload.categoryDeniedError },
        { status: 403 },
      );
    }

    documentoId = inserted.id;
    version = 1;
  }

  const filename = sanitizeStorageFilename(file.name);
  const storagePath = buildDocumentoStoragePath(
    clienteId,
    documentoId,
    version,
    filename,
  );

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return denied();
  }

  const { error: versionError } = await supabase.rpc("add_documento_version", {
    p_documento_id: documentoId,
    p_storage_path: storagePath,
    p_original_filename: filename,
    p_size_bytes: file.size,
    p_mime_type: file.type,
  });

  if (versionError) {
    // Bytes are already at `storagePath` and cannot be removed from here (no
    // DELETE policy). See the ORDERING note above.
    return denied();
  }

  revalidatePath(`/crm/${clienteId}/documentos`);
  return Response.json({ success: true });
}
