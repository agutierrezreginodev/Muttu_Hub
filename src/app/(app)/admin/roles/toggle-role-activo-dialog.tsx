"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { toggleRoleActivoAction } from "@/lib/admin/actions";
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

interface ToggleRoleActivoDialogProps {
  rolId: number;
  nombre: string;
  activo: boolean;
}

/**
 * Roles CRUD's "delete" (task 4.7, spec §3.4: never hard-delete). Toggles
 * rol.activo — has_permission()'s WHERE clause already requires r.activo,
 * so a deactivated role denies everyone holding it without touching any
 * usuario row, and is reversible the same way.
 */
export function ToggleRoleActivoDialog({
  rolId,
  nombre,
  activo,
}: ToggleRoleActivoDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await toggleRoleActivoAction(rolId, !activo);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: activo ? es.admin.roleUpdateSuccess : es.admin.roleUpdateSuccess,
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
              ? es.admin.deactivateRoleConfirmTitle
              : es.admin.activateRoleConfirmTitle}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {activo ? es.admin.deactivateRoleConfirmDescription : null}
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
