"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { es } from "@/messages/es";
import { postDocumentoUpload } from "@/lib/documentos/upload-client";
import { formatBytes } from "@/lib/documentos/format";
import type { DocumentoVersionListItem } from "@/lib/documentos/queries";
import {
  resolveUsuarioLabel,
  type UsuarioDirectory,
} from "@/lib/admin/directory-options";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DocumentoVersionDialogProps {
  clienteId: number;
  documentoId: number;
  nombre: string;
  /** Already ordered newest-first by `listVersionesByCliente` — this component never re-sorts. */
  versiones: DocumentoVersionListItem[];
  directory: UsuarioDirectory;
}

/**
 * Version history + add-a-version (task 5b.1/5b.2, spec document-versioning
 * "Version history is retained and viewable"). Each entry links to its OWN
 * version through `?version=`, which PR6's download route resolves — the spec
 * requires that downloading version 1 serve the version-1 object and NOT
 * silently redirect to the current one, so the link must never omit the
 * parameter for historic entries.
 *
 * Versions arrive as a prop (from `listVersionesByCliente`, one query for the
 * whole tab) rather than being fetched when the dialog opens: this codebase
 * fetches on the server and keeps client components presentational, and a
 * per-dialog fetch would mean one round trip per row.
 *
 * Uploading a new version sends ONLY `documentoId` + bytes — never metadata,
 * so a new version cannot rename or recategorize its parent. `router.refresh()`
 * is required after success for the same reason as in the upload dialog: the
 * route revalidates server-side, but a client fetch does not re-render the RSC
 * tree.
 */
export function DocumentoVersionDialog({
  clienteId,
  documentoId,
  nombre,
  versiones,
  directory,
}: DocumentoVersionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleUpload() {
    if (!file) {
      setError(es.common.requiredField);
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const result = await postDocumentoUpload({
        clienteId,
        documentoId,
        file,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.documentos.newVersion.success, type: "success" });
      setFile(null);
      router.refresh();
    });
  }

  const titleId = `documento-versiones-title-${documentoId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 min-h-11" />}
      >
        {es.documentos.versionHistory.title}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>
            {es.documentos.versionHistory.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{nombre}</p>
        {versiones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {es.documentos.versionHistory.noEntries}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {versiones.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {es.documentos.version} {version.version} —{" "}
                    <span className="font-normal">
                      {version.originalFilename}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(version.sizeBytes)} · {version.mimeType} ·{" "}
                    {resolveUsuarioLabel(directory, version.uploadedBy)} ·{" "}
                    {new Date(version.createdAt).toLocaleString("es-CO")}
                  </span>
                </div>
                <Link
                  href={`/crm/${clienteId}/documentos/${documentoId}/descargar?version=${version.version}`}
                  className="inline-flex h-11 min-h-11 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {es.documentos.download}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${titleId}-file`} className="text-base font-medium">
            {es.documentos.upload.file}
          </label>
          <Input
            id={`${titleId}-file`}
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="h-11 text-base"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base sm:w-auto"
          >
            {isPending ? es.common.saving : es.documentos.newVersion.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
