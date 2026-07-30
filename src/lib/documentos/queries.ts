import { createClient } from "@/lib/supabase/server";

export interface DocumentoListItem {
  id: number;
  clienteId: number;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  tags: string[];
  currentVersion: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  uploadedBy: string | null;
  currentUploadedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * List documents for a cliente (task 4.3/4.4, spec document-library "List
 * documents for a cliente"). Reads `v_documento` (never the base
 * `documento` table), which already joins in the current version's
 * physical attributes via a lateral join and hides soft-deleted rows.
 * Relies ENTIRELY on RLS's 3-axis gate (`cliente_visible` +
 * `has_permission('documentos','ver')` + `categoria_visible`) — a caller
 * missing any single axis gets zero rows here, never an error, the same
 * trust-RLS convention as every other query helper in this codebase
 * (`listContactos`, `listOportunidades`). `currentVersion`/`sizeBytes`/etc.
 * are nullable because the view's `left join lateral` can, in principle,
 * find no version row.
 */
export async function listDocumentos(
  clienteId: number,
): Promise<DocumentoListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_documento")
    .select(
      "id, cliente_id, nombre, categoria, descripcion, tags, current_version, size_bytes, mime_type, original_filename, uploaded_by, current_uploaded_at, created_at, created_by, updated_at, updated_by",
    )
    .eq("cliente_id", clienteId)
    .order("nombre");

  return (data ?? []).map((row) => ({
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    categoria: row.categoria,
    descripcion: row.descripcion,
    tags: row.tags ?? [],
    currentVersion: row.current_version,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    uploadedBy: row.uploaded_by,
    currentUploadedAt: row.current_uploaded_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export interface DocumentoVersionListItem {
  id: number;
  documentoId: number;
  version: number;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string | null;
  createdAt: string;
}

/**
 * List every version of a document, newest-first (task 4.3/4.4, spec
 * document-versioning "Version history is retained and viewable" —
 * "all three versions appear, newest first"). Reads the base
 * `documento_version` table directly (there is no view for it — `v_documento`
 * only exposes the CURRENT version); visibility is entirely derived from
 * the parent via `documento_version_select` RLS (design RLS policy shape),
 * so an invisible `documentoId` yields an empty array, never an error, same
 * trust-RLS convention as `listDocumentos`.
 */
export async function listVersiones(
  documentoId: number,
): Promise<DocumentoVersionListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documento_version")
    .select(
      "id, documento_id, version, storage_bucket, storage_path, original_filename, size_bytes, mime_type, uploaded_by, created_at",
    )
    .eq("documento_id", documentoId)
    .order("version", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    documentoId: row.documento_id,
    version: row.version,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));
}
