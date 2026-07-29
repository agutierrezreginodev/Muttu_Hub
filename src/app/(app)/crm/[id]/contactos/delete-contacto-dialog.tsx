"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { deleteContactoAction } from "@/lib/crm/actions";
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

interface DeleteContactoDialogProps {
  clienteId: number;
  contactoId: number;
  nombre: string;
}

/**
 * Soft-delete contacto (task 7.5, spec CO4). One-directional: `contacto`
 * carries no DELETE grant at all — `soft_delete_contacto` sets `deleted_at`
 * and there is no reactivate path in this UI (same shape as
 * `DeactivateCatalogoDialog`).
 */
export function DeleteContactoDialog({
  clienteId,
  contactoId,
  nombre,
}: DeleteContactoDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteContactoAction(clienteId, contactoId);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: es.crm.contactos.deleteSuccess,
        type: "success",
      });
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
          <DialogTitle>{es.crm.contactos.deleteConfirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {es.crm.contactos.deleteConfirmDescription}
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
