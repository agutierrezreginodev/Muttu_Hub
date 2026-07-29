"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createClienteAction } from "@/lib/crm/actions";
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

/**
 * Create cliente (task 6.7). Mirrors `CatalogoFormDialog`'s explicit-object
 * submit pattern (src/app/(app)/admin/catalogos/catalogo-form-dialog.tsx):
 * plain `useState` + `useTransition`, calling the Server Action directly
 * rather than via `<form action>`/FormData. `tipoCliente`/`estado` are left
 * for the General tab and future picklists to refine — this dialog's one
 * purpose is getting a new cliente into the list (spec S1: one flow, one
 * purpose per screen).
 */
export function ClienteFormDialog() {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await createClienteAction({ nombre });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.crm.createSuccess, type: "success" });
      setNombre("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 min-h-11" />}>
        {es.crm.createCliente}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.crm.createClienteTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cliente-nombre" className="text-base font-medium">
              {es.crm.nombre}
            </label>
            <Input
              id="cliente-nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
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
