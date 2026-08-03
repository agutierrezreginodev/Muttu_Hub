"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { es } from "@/messages/es";
import { postDocumentoUpload } from "@/lib/documentos/upload-client";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface UploadDocumentoDialogProps {
  clienteId: number;
  /** Active `categoria_documento` codes only. Empty until an admin seeds the catalog (design Decision 8). */
  categoriaOptions: CatalogoOption[];
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Upload a NEW document (task 5b.1/5b.2, spec document-library "Upload a
 * document"). Adding a version to an EXISTING document is the version
 * dialog's job — both go through `postDocumentoUpload` to the same Route
 * Handler, which distinguishes the two by the presence of `documentoId`.
 *
 * Unlike every other dialog in this codebase, the submit path is a client
 * `fetch` to a Route Handler rather than a Server Action (design Decision 6 —
 * byte transport). Two consequences worth knowing:
 *
 * 1. The route calls `revalidatePath`, but a client fetch does NOT re-render
 *    the RSC tree, so `router.refresh()` is what actually makes the new row
 *    appear. Dropping it leaves the table stale until a manual reload.
 * 2. There is no zod parse here. `documentoUploadMetadataSchema` validates
 *    SHAPE server-side; the only client-side guard is "a file was chosen",
 *    because submitting no bytes at all is a UI mistake, not a server
 *    concern. Category authorization is enforced by RLS and surfaces as the
 *    route's own inline error.
 */
export function UploadDocumentoDialog({
  clienteId,
  categoriaOptions,
}: UploadDocumentoDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(categoriaOptions[0]?.codigo ?? "");
  const [descripcion, setDescripcion] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!file) {
      setError(es.common.requiredField);
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const result = await postDocumentoUpload({
        clienteId,
        file,
        metadata: { nombre, categoria, descripcion, tags: parseTags(tags) },
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.documentos.upload.success, type: "success" });
      setOpen(false);
      setFile(null);
      setNombre("");
      setDescripcion("");
      setTags("");
      router.refresh();
    });
  }

  const titleId = "documento-upload-title";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 min-h-11" />}>
        {es.documentos.upload.button}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>{es.documentos.upload.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-file`}
              className="text-base font-medium"
            >
              {es.documentos.upload.file}
            </label>
            <Input
              id={`${titleId}-file`}
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-nombre`}
              className="text-base font-medium"
            >
              {es.documentos.nombre}
            </label>
            <Input
              id={`${titleId}-nombre`}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-categoria`}
              className="text-base font-medium"
            >
              {es.documentos.categoria}
            </label>
            <Select
              value={categoria}
              onValueChange={(value) => setCategoria(value ?? "")}
            >
              <SelectTrigger
                id={`${titleId}-categoria`}
                className="h-11 min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoriaOptions.map((option) => (
                  <SelectItem key={option.codigo} value={option.codigo}>
                    {option.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-descripcion`}
              className="text-base font-medium"
            >
              {es.documentos.descripcion}
            </label>
            <Textarea
              id={`${titleId}-descripcion`}
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-tags`}
              className="text-base font-medium"
            >
              {es.documentos.tags}
            </label>
            <Input
              id={`${titleId}-tags`}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base sm:w-auto"
          >
            {isPending ? es.common.saving : es.documentos.upload.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
