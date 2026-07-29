"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { deactivateCatalogoAction } from "@/lib/admin/actions";
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

interface DeactivateCatalogoDialogProps {
  tipo: string;
  codigo: string;
  etiqueta: string;
}

/**
 * Deactivate catalogo (task 5.5/5.6, spec CAT3/CAT5). Unlike
 * ToggleRoleActivoDialog, this is one-directional: `activo` carries no
 * UPDATE grant at all (design Decision 7), so there is no in-app
 * reactivate path once a code is deactivated — the RPC
 * (`soft_delete_catalogo`) can only ever set it to false. The referential
 * guard (CAT5) is enforced server-side; a rejection surfaces here as a
 * specific "code in use" toast/error, not a generic failure message.
 */
export function DeactivateCatalogoDialog({
  tipo,
  codigo,
  etiqueta,
}: DeactivateCatalogoDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deactivateCatalogoAction(tipo, codigo);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title: es.admin.catalogos.deactivateSuccess,
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
        {es.admin.deactivate}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.admin.catalogos.deactivateConfirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {es.admin.catalogos.deactivateConfirmDescription}
        </p>
        <p className="text-sm">{etiqueta}</p>
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
