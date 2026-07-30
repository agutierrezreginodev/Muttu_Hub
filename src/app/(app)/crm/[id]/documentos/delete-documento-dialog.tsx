"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { deleteDocumentoAction } from "@/lib/documentos/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DeleteDocumentoDialogProps {
  clienteId: number;
  documentoId: number;
  nombre: string;
}

/**
 * Soft-delete a document (task 5b.1/5b.2, spec document-library "Soft-delete
 * a document"). Same one-directional shape as `DeleteOportunidadDialog`:
 * `documento` carries no DELETE grant at all, so
 * `public.soft_delete_documento` is the only path that sets `deleted_at`.
 *
 * The copy states that already-uploaded files are RETAINED — soft-deleting
 * the parent hides its versions (spec document-versioning "Soft-deleting the
 * parent hides its versions") but deliberately does not purge the storage
 * objects, so the confirmation must not read as a permanent byte deletion.
 */
export function DeleteDocumentoDialog({
  clienteId,
  documentoId,
  nombre,
}: DeleteDocumentoDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteDocumentoAction(clienteId, documentoId);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.documentos.delete.success, type: "success" });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="destructive" className="h-11 min-h-11" />}
      >
        {es.common.delete}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.documentos.delete.confirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {es.documentos.delete.confirmDescription}
        </p>
        <p className="text-sm">{nombre}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            className="h-11 min-h-11 w-full text-base sm:w-auto"
          >
            {isPending ? es.common.saving : es.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
