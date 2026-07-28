"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import {
  deactivateUserAction,
  reactivateUserAction,
} from "@/lib/admin/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DeactivateReactivateUserDialogProps {
  usuarioId: string;
  nombre: string;
  activo: boolean;
}

/**
 * Deactivate/reactivate user (task 4.6, spec U6). Reversible: the same
 * component drives both directions depending on the row's current state.
 */
export function DeactivateReactivateUserDialog({
  usuarioId,
  nombre,
  activo,
}: DeactivateReactivateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = activo
        ? await deactivateUserAction(usuarioId)
        : await reactivateUserAction(usuarioId);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: activo ? es.admin.deactivateSuccess : es.admin.reactivateSuccess,
        type: "success",
      });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={activo ? "destructive" : "outline"}
            className="h-11 min-h-11"
          />
        }
      >
        {activo ? es.admin.deactivate : es.admin.activate}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activo
              ? es.admin.deactivateConfirmTitle
              : es.admin.reactivateConfirmTitle}
          </DialogTitle>
          <DialogDescription>
            {activo
              ? es.admin.deactivateConfirmDescription
              : es.admin.reactivateConfirmDescription}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">{nombre}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant={activo ? "destructive" : "default"}
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
