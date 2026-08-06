"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { deleteTareaAction } from "@/lib/kanban/actions";
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

interface DeleteTareaDialogProps {
  tareaId: number;
  /** Shown in the confirmation body, so the wrong card is not confirmed blindly. */
  titulo: string;
}

/**
 * Soft-delete a board card (spec KT3). Same one-directional shape as
 * `DeleteContactoDialog`: `soft_delete_tarea` sets `deleted_at` and this UI
 * offers no reactivate path, because `tarea` carries no DELETE grant and
 * `deleted_at` is not UPDATE-granted for anyone.
 */
export function DeleteTareaDialog({ tareaId, titulo }: DeleteTareaDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteTareaAction(tareaId);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.kanban.tarjeta.deleteSuccess, type: "success" });
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
          <DialogTitle>{es.kanban.tarjeta.deleteConfirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {es.kanban.tarjeta.deleteConfirmDescription}
        </p>
        <p className="text-sm">{titulo}</p>
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
