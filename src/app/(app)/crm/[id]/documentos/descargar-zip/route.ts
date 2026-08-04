import { Zip, ZipPassThrough } from "fflate";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import type { Accion, Modulo } from "@/lib/permissions";
import { buildZipEntryNames } from "@/lib/documentos/zip-entries";

// Route Handlers may only export Next's own named fields, so the export bounds
// live in ./limits — see that file for the build error this avoids.
import { MAX_ZIP_DOCUMENTS, MAX_ZIP_TOTAL_BYTES } from "./limits";

export const runtime = "nodejs";

const BUCKET = "documentos";

interface CurrentVersion {
  storagePath: string;
  originalFilename: string;
  sizeBytes: number;
}

/**
 * Multi-select zip export (task 6.4/6.5, spec document-zip-export, design
 * Decision 7).
 *
 * Authorization has two distinct layers and both are load-bearing:
 * `documentos.exportar` is pre-checked once here because bulk export is its own
 * capability (a caller may read documents one at a time yet not be allowed to
 * bulk-extract them), while per-document visibility stays with RLS on the reads.
 * A selection containing documents the caller cannot see is NOT an error — those
 * rows simply do not come back and are omitted from the archive, per the spec's
 * "Unauthorized selections are excluded" scenario.
 *
 * Entries are STORED, not deflated: business documents (pdf, docx, xlsx,
 * images) are already compressed, so deflating them costs real CPU in a
 * serverless function for a percent or two of savings. The zip here is a
 * bundling convenience, not a compression feature.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return Response.json({ error: es.common.genericError }, { status: 400 });
  }

  let documentoIds: number[];
  try {
    const body = (await request.json()) as { documentoIds?: unknown };
    if (
      !Array.isArray(body.documentoIds) ||
      body.documentoIds.length === 0 ||
      !body.documentoIds.every(
        (value) => Number.isInteger(value) && (value as number) > 0,
      )
    ) {
      return Response.json(
        { error: es.documentos.zip.noSelectionError },
        { status: 400 },
      );
    }
    documentoIds = body.documentoIds as number[];
  } catch {
    return Response.json({ error: es.common.genericError }, { status: 400 });
  }

  // Checked before the permission round trip and before any query: an
  // over-count selection is refused without touching the database at all.
  if (documentoIds.length > MAX_ZIP_DOCUMENTS) {
    return Response.json(
      { error: es.documentos.zip.tooManyError },
      { status: 413 },
    );
  }

  const supabase = await createClient();
  const { data: allowed, error: permissionError } = await supabase.rpc(
    "has_permission",
    {
      modulo: "documentos" satisfies Modulo,
      accion: "exportar" satisfies Accion,
    },
  );
  if (permissionError || !allowed) {
    return Response.json({ error: es.common.genericError }, { status: 403 });
  }

  // One query for the whole selection, ordered so the FIRST row per document is
  // its current version. `v_documento` cannot serve this: it omits
  // `storage_path`, which is the one column needed to fetch the bytes.
  const { data: versionRows } = await supabase
    .from("documento_version")
    .select(
      "documento_id, version, storage_path, original_filename, size_bytes",
    )
    .in("documento_id", documentoIds)
    .order("version", { ascending: false });

  const currentByDocumento = new Map<number, CurrentVersion>();
  for (const row of versionRows ?? []) {
    if (!currentByDocumento.has(row.documento_id)) {
      currentByDocumento.set(row.documento_id, {
        storagePath: row.storage_path,
        originalFilename: row.original_filename,
        sizeBytes: row.size_bytes,
      });
    }
  }

  const selected = [...currentByDocumento.values()];
  if (selected.length === 0) {
    // Nothing visible: a 204 rather than a zip with no entries, which some
    // clients surface as a corrupt download.
    return new Response(null, { status: 204 });
  }

  const totalBytes = selected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
    // `size_bytes` comes from the database, so the size cap costs zero storage
    // reads — the spec requires refusing "before downloading any bytes".
    return Response.json(
      { error: es.documentos.zip.tooLargeError },
      { status: 413 },
    );
  }

  const entryNames = buildZipEntryNames(
    selected.map((entry) => entry.originalFilename),
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const zip = new Zip((error, chunk, final) => {
        if (closed) {
          return;
        }
        if (error) {
          closed = true;
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) {
          closed = true;
          controller.close();
        }
      });

      void (async () => {
        try {
          for (const [index, entry] of selected.entries()) {
            const { data: blob } = await supabase.storage
              .from(BUCKET)
              .download(entry.storagePath);

            if (!blob) {
              // A single unreadable object (revoked mid-export, or bytes
              // orphaned by a failed upload) must not abort the whole archive.
              continue;
            }

            const file = new ZipPassThrough(entryNames[index]);
            zip.add(file);
            file.push(new Uint8Array(await blob.arrayBuffer()), true);
          }
          zip.end();
        } catch (error) {
          if (!closed) {
            closed = true;
            controller.error(error);
          }
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="documentos-${clienteId}.zip"`,
    },
  });
}
