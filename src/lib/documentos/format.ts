/**
 * Formats a byte count for display. Shared by the documentos table (current
 * version) and the version-history dialog (each historic version), which is
 * why it lives in lib rather than in either component — PR5a had it local to
 * `documentos-table.tsx` until the history dialog needed the same rendering.
 *
 * Not natural-language copy: plain B/KB/MB suffixes get the same treatment as
 * `toLocaleString("es-CO")` currency formatting elsewhere in this codebase, so
 * there is no `es.ts` entry for the unit. Returns the em dash for a null count
 * (`v_documento`'s lateral join can, in principle, resolve no version).
 */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toLocaleString("es-CO", { maximumFractionDigits: 1 })} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}
