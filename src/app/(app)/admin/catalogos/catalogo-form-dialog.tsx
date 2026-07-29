"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import {
  createCatalogoAction,
  updateCatalogoAction,
} from "@/lib/admin/actions";
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
import type { CatalogoRow } from "./catalogo-table";

interface CatalogoFormDialogProps {
  mode: "create" | "edit";
  catalogo?: CatalogoRow;
}

/**
 * Create/edit catalogo (task 5.5, spec CAT4): any tipo/codigo, zero
 * migrations. `tipo`/`codigo` are only editable in create mode — they are
 * the natural-key PK (CAT1) and the DB grant only allows updating
 * etiqueta/orden after creation (design migration 1, section 2), so the
 * edit form never renders them as inputs.
 */
export function CatalogoFormDialog({
  mode,
  catalogo,
}: CatalogoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState(catalogo?.tipo ?? "");
  const [codigo, setCodigo] = useState(catalogo?.codigo ?? "");
  const [etiqueta, setEtiqueta] = useState(catalogo?.etiqueta ?? "");
  const [orden, setOrden] = useState(catalogo?.orden ?? 0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCatalogoAction({ tipo, codigo, etiqueta, orden })
          : await updateCatalogoAction(catalogo!.tipo, catalogo!.codigo, {
              etiqueta,
              orden,
            });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title:
          mode === "create"
            ? es.admin.catalogos.createSuccess
            : es.admin.catalogos.updateSuccess,
        type: "success",
      });
      setOpen(false);
    });
  }

  const titleId = `catalogo-form-title-${catalogo ? `${catalogo.tipo}-${catalogo.codigo}` : "new"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={mode === "create" ? "default" : "outline"}
            className="h-11 min-h-11"
          />
        }
      >
        {mode === "create" ? es.admin.catalogos.createCatalogo : es.common.edit}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>
            {mode === "create"
              ? es.admin.catalogos.createCatalogoTitle
              : es.admin.catalogos.editCatalogoTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {mode === "create" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${titleId}-tipo`}
                  className="text-base font-medium"
                >
                  {es.admin.catalogos.tipo}
                </label>
                <Input
                  id={`${titleId}-tipo`}
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value)}
                  required
                  className="h-11 text-base"
                />
                <p className="text-xs text-muted-foreground">
                  {es.admin.catalogos.tipoHelp}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${titleId}-codigo`}
                  className="text-base font-medium"
                >
                  {es.admin.catalogos.codigo}
                </label>
                <Input
                  id={`${titleId}-codigo`}
                  value={codigo}
                  onChange={(event) => setCodigo(event.target.value)}
                  required
                  className="h-11 text-base"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>
                {es.admin.catalogos.tipo}: {catalogo?.tipo}
              </span>
              <span>
                {es.admin.catalogos.codigo}: {catalogo?.codigo}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-etiqueta`}
              className="text-base font-medium"
            >
              {es.admin.catalogos.etiqueta}
            </label>
            <Input
              id={`${titleId}-etiqueta`}
              value={etiqueta}
              onChange={(event) => setEtiqueta(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-orden`}
              className="text-base font-medium"
            >
              {es.admin.catalogos.orden}
            </label>
            <Input
              id={`${titleId}-orden`}
              type="number"
              value={orden}
              onChange={(event) => setOrden(Number(event.target.value))}
              required
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
