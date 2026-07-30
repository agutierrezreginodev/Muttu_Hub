"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";
import { requestDocumentoZip } from "@/lib/documentos/zip-client";
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
import { formatBytes } from "@/lib/documentos/format";
import type {
  DocumentoListItem,
  DocumentoVersionListItem,
} from "@/lib/documentos/queries";
import { EditDocumentoDialog } from "./edit-documento-dialog";
import { DeleteDocumentoDialog } from "./delete-documento-dialog";
import { DocumentoVersionDialog } from "./documento-version-dialog";

interface DocumentosTableProps {
  rows: DocumentoListItem[];
  clienteId: number;
  catalogoOptions: CatalogoOptionsMap;
  directory: UsuarioDirectory;
  /** Every version for the cliente, keyed by `documento_id` — one query for the whole tab, not one per row. */
  versionesByDocumento: Map<number, DocumentoVersionListItem[]>;
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
 * PR5b adds the per-row actions cell (version history, edit, delete), so this
 * component owns dialog composition but still holds no data-fetching of its
 * own — the dialogs call their Server Actions (or, for byte transport, the
 * upload route) directly, the same way `OportunidadesTable` hosts its own row
 * dialogs. `versionesByDocumento` arrives pre-fetched for the whole tab, so
 * opening a history costs no round trip.
 *
 * Per-row selection state (checkboxes) is local to this component and drives
 * the zip-export button (PR6 task 6.6), which appears only once something is
 * selected. The selection is posted in ON-SCREEN row order rather than in the
 * order the boxes were ticked, so the archive's entry order — and therefore
 * which duplicate filename gets the ` (2)` suffix — is stable.
 *
 * The per-row download link resolves against PR6's descargar route; PR5a
 * shipped it as a disclosed 404 and PR6b closed that gap.
 */
export function DocumentosTable({
  rows,
  clienteId,
  catalogoOptions,
  directory,
  versionesByDocumento,
}: DocumentosTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [zipError, setZipError] = useState<string | undefined>(undefined);
  const [isExporting, startExport] = useTransition();
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

  function handleExport() {
    setZipError(undefined);
    startExport(async () => {
      // Ordered by the rows on screen rather than by insertion, so the archive's
      // entry order (and therefore its de-duplication suffixes) is stable
      // regardless of the order the user ticked the boxes in.
      const documentoIds = rows
        .filter((row) => selectedIds.has(row.id))
        .map((row) => row.id);

      const result = await requestDocumentoZip({ clienteId, documentoIds });
      if (result.error) {
        setZipError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
            className="h-11 min-h-11"
          >
            {isExporting
              ? es.documentos.zip.preparing
              : es.documentos.zip.button}
          </Button>
          {zipError ? (
            <p role="alert" className="text-sm text-destructive">
              {zipError}
            </p>
          ) : null}
        </div>
      ) : null}
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
            <TableHead className="text-right">
              {es.documentos.download}
            </TableHead>
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
                  <DocumentoVersionDialog
                    clienteId={clienteId}
                    documentoId={row.id}
                    nombre={row.nombre}
                    versiones={versionesByDocumento.get(row.id) ?? []}
                    directory={directory}
                  />
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
    </div>
  );
}
