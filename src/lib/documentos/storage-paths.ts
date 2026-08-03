/**
 * Storage path builder for the private `documentos` bucket (design "Storage
 * layout"; spec document-library "Storage layout and bucket"). `clienteId`
 * MUST be the FIRST path segment: PR3's `storage.objects` INSERT policy
 * reads `(storage.foldername(name))[1]` as the cliente id gating upload
 * authorization (`cliente_visible`) — reordering these segments silently
 * breaks that gate for every future upload (apply-progress carry-forward
 * note from PR3).
 */
export function buildDocumentoStoragePath(
  clienteId: number,
  documentoId: number,
  version: number,
  filename: string,
): string {
  return `${clienteId}/${documentoId}/${version}/${sanitizeStorageFilename(filename)}`;
}

// Combining diacritical marks (U+0300-U+036F) that NFD normalization splits
// a base letter + accent into (e.g. "n" + combining tilde for "ñ").
const COMBINING_DIACRITICS_PATTERN = /[̀-ͯ]/g;

/**
 * Sanitizes a user-supplied filename before it becomes the LAST Storage
 * path segment: keeps only the final path component (defends against
 * directory traversal / embedded separators reaching the object key),
 * strips diacritics via NFD normalization (so common Spanish filenames like
 * "señal" degrade to "senal" instead of losing the ñ entirely), collapses
 * whitespace runs to a single underscore, and drops every character outside
 * a conservative safe set (`[a-zA-Z0-9._-]`). Falls back to "documento" when
 * nothing survives sanitization.
 *
 * Cross-selection filename COLLISIONS (e.g. two selected documents both
 * named "acta.pdf" in a zip export) are NOT handled here — every version
 * already has its own `{version}` path segment, so uploads never collide at
 * the storage-path level; the zip-entry-naming helper (PR6) is the layer
 * that de-duplicates display names within one archive.
 */
export function sanitizeStorageFilename(filename: string): string {
  const trimmed = filename.trim();
  const lastSegment = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const withoutDiacritics = lastSegment
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_PATTERN, "");
  const withUnderscores = withoutDiacritics.replace(/\s+/g, "_");
  const safe = withUnderscores.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe.length > 0 ? safe : "documento";
}
