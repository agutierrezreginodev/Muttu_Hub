"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { deleteOportunidadAction } from "@/lib/crm/actions";
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

interface DeleteOportunidadDialogProps {
  clienteId: number;
  oportunidadId: number;
  nombre: string;
}

/**
 * Soft-delete oportunidad (task 7.6, spec OP2). One-directional, same shape
 * as `DeleteContactoDialog`/`DeactivateCatalogoDialog`: `oportunidad`
 * carries no DELETE grant at all — `soft_delete_oportunidad` is the only
 * path that sets `deleted_at`.
 */
export function DeleteOportunidadDialog({
  clienteId,
  oportunidadId,
  nombre,
}: DeleteOportunidadDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteOportunidadAction(clienteId, oportunidadId);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: es.crm.oportunidades.deleteSuccess,
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
          <DialogTitle>{es.crm.oportunidades.deleteConfirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {es.crm.oportunidades.deleteConfirmDescription}
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
