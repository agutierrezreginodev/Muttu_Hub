"use client";

import { useState } from "react";
import Link from "next/link";

import { es } from "@/messages/es";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  activeCatalogoOptions,
  resolveCatalogoLabel,
  type CatalogoOptionsMap,
} from "@/lib/crm/catalogo-options";
import {
  resolveUsuarioLabel,
  type UsuarioDirectory,
} from "@/lib/admin/directory-options";
import type { DocumentoListItem } from "@/lib/documentos/queries";
import { EditDocumentoDialog } from "./edit-documento-dialog";
import { DeleteDocumentoDialog } from "./delete-documento-dialog";

interface DocumentosTableProps {
  rows: DocumentoListItem[];
  clienteId: number;
  catalogoOptions: CatalogoOptionsMap;
  directory: UsuarioDirectory;
}

/**
 * Formats a byte count for display (task 5a.4). Not a spec-mandated unit —
 * plain KB/MB abbreviations, same "not natural-language copy" treatment as
 * `toLocaleString("es-CO")` currency formatting elsewhere in this codebase
 * (no `es.ts` entry needed for a numeric unit suffix). Returns the em dash
 * for a null byte count (a document whose current version, in principle,
 * could not be resolved by `v_documento`'s lateral join).
 */
function formatBytes(bytes: number | null): string {
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

/**
 * Presentational documentos table (task 5a.3/5a.4, spec document-library
 * "List documents for a cliente" + "Documentos ficha tab (7th tab)").
 * Mirrors `OportunidadesTable`/`ContactosTable`: `categoria` is resolved via
 * `resolveCatalogoLabel` (client-safe, `@/lib/crm/catalogo-options`) so a
 * deactivated category code still reads correctly for history, and
 * `subidoPor` is resolved via `resolveUsuarioLabel`
 * (`@/lib/admin/directory-options`, the client-safe split of
 * `directory.ts` this same slice introduces) — never the server-only
 * barrels, or a `"use client"` file pulls `next/headers` into the client
 * bundle (the exact PR7 bug those two split files document).
 *
 * PR5b adds the per-row actions cell (`EditDocumentoDialog` +
 * `DeleteDocumentoDialog`), so this component owns dialog composition but
 * still holds no data-fetching or mutation logic of its own — the dialogs
 * call the Server Actions directly, the same way `OportunidadesTable` hosts
 * its own row dialogs.
 *
 * Per-row selection state (checkboxes) is local to this component; no
 * consumer exists yet (the zip-export button that reads it lands in PR6
 * task 6.6). The per-row download link already points at the real PR6
 * route shape (`crm/[id]/documentos/[documentoId]/descargar`) — that Route
 * Handler itself ships in PR6; until then this link 404s, a disclosed,
 * expected gap for this slice's own sequencing (spec document-library
 * "Single-document download").
 */
export function DocumentosTable({
  rows,
  clienteId,
  catalogoOptions,
  directory,
}: DocumentosTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Derived here rather than taken as a prop: the full map is already on hand,
  // and the edit picker must offer active codes ONLY (a deactivated category
  // still resolves as a LABEL above, for history, but is never a new choice).
  const categoriaOptions = activeCatalogoOptions(
    catalogoOptions,
    "categoria_documento",
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{es.documentos.noEntries}</p>
    );
  }

  function toggleSelection(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">{es.documentos.selectRow}</span>
          </TableHead>
          <TableHead>{es.documentos.nombre}</TableHead>
          <TableHead>{es.documentos.categoria}</TableHead>
          <TableHead>{es.documentos.version}</TableHead>
          <TableHead>{es.documentos.tamano}</TableHead>
          <TableHead>{es.documentos.subidoPor}</TableHead>
          <TableHead>{es.documentos.fechaSubida}</TableHead>
          <TableHead className="text-right">{es.documentos.download}</TableHead>
          {/* Same actions-column header convention as OportunidadesTable. */}
          <TableHead className="text-right">{es.common.edit}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <input
                type="checkbox"
                className="h-4 w-4"
                aria-label={`${es.documentos.selectRow} ${row.nombre}`}
                checked={selectedIds.has(row.id)}
                onChange={() => toggleSelection(row.id)}
              />
            </TableCell>
            <TableCell className="font-medium">{row.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {resolveCatalogoLabel(
                catalogoOptions,
                "categoria_documento",
                row.categoria,
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.currentVersion ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatBytes(row.sizeBytes)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {resolveUsuarioLabel(directory, row.uploadedBy)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.currentUploadedAt
                ? new Date(row.currentUploadedAt).toLocaleString("es-CO")
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/crm/${clienteId}/documentos/${row.id}/descargar`}
                className="inline-flex h-11 min-h-11 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {es.documentos.download}
              </Link>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-wrap justify-end gap-2">
                <EditDocumentoDialog
                  clienteId={clienteId}
                  documento={row}
                  categoriaOptions={categoriaOptions}
                />
                <DeleteDocumentoDialog
                  clienteId={clienteId}
                  documentoId={row.id}
                  nombre={row.nombre}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
