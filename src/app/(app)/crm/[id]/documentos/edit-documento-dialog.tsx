"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { updateDocumentoAction } from "@/lib/documentos/actions";
import type { DocumentoListItem } from "@/lib/documentos/queries";
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

interface EditDocumentoDialogProps {
  clienteId: number;
  documento: DocumentoListItem;
  /** Active `categoria_documento` codes only — a deactivated code is never offered as a NEW choice. */
  categoriaOptions: CatalogoOption[];
}

/**
 * Parses the comma-separated tags field into the array the column stores.
 * `tags` is set-replaced on every save (never diffed), exactly like
 * `oportunidadSchema.serviciosInteres`, so an empty field MUST yield `[]` and
 * not `undefined` — otherwise clearing every tag would silently keep the old
 * ones.
 */
function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Edit document metadata (task 5b.1/5b.2, spec document-library "Edit
 * document metadata"). Mirrors `OportunidadFormDialog`'s edit half:
 * `useTransition`, inline `role="alert"` for the action's error, success
 * toast, h-11 touch targets.
 *
 * Recategorizing into a category the caller has no grant on is NOT blocked
 * here — the picker offers every active code. `documento_update`'s WITH
 * CHECK (`categoria_visible(new)`) is the real gate, and the action surfaces
 * its failure inline (spec document-permissions "Recategorize into an
 * ungranted category is blocked"). Client-side filtering would only hide the
 * option, not enforce anything, and would need the caller's grant set here.
 */
export function EditDocumentoDialog({
  clienteId,
  documento,
  categoriaOptions,
}: EditDocumentoDialogProps) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(documento.nombre);
  const [categoria, setCategoria] = useState(documento.categoria);
  const [descripcion, setDescripcion] = useState(documento.descripcion ?? "");
  const [tags, setTags] = useState(documento.tags.join(", "));
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateDocumentoAction(clienteId, documento.id, {
        nombre,
        categoria,
        descripcion,
        // The full current set — never a diff. See parseTags above.
        tags: parseTags(tags),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.documentos.edit.success, type: "success" });
      setOpen(false);
    });
  }

  const titleId = `documento-edit-title-${documento.id}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 min-h-11" />}
      >
        {es.common.edit}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>{es.documentos.edit.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
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
              // `categoria` is NOT NULL and is the permission-gating axis, so
              // this picker offers no "none" option — but the Select contract
              // still allows null, which collapses to "" and is rejected by
              // `documentoMetadataSchema` rather than silently written.
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
            {isPending ? es.common.saving : es.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
