"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createCompromisoAction } from "@/lib/crm/actions";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface CompromisoFormDialogProps {
  clienteId: number;
  prioridadOptions: CatalogoOption[];
}

const NONE_VALUE = "__none__";

function fromSelectValue(value: string | null): string {
  return value === NONE_VALUE || value === null ? "" : value;
}

/**
 * Create-only dialog for Compromisos (task 8.5, spec FC9, design
 * Decision 9): a plain `tarea` insert with `origen = 'CRM'` via
 * `createCompromisoAction`. No edit mode exists — Compromisos is
 * "read + create only" per this PR's scope, mirroring
 * `ContactoFormDialog`'s explicit-object submit pattern for the create
 * path.
 */
export function CompromisoFormDialog({
  clienteId,
  prioridadOptions,
}: CompromisoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await createCompromisoAction(clienteId, {
        titulo,
        fechaLimite,
        prioridad,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.crm.compromisos.createSuccess, type: "success" });
      setOpen(false);
      setTitulo("");
      setFechaLimite("");
      setPrioridad("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="default" className="h-11 min-h-11" />}
      >
        {es.crm.compromisos.createCompromiso}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id="compromiso-form-title">
            {es.crm.compromisos.createCompromisoTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="compromiso-form-titulo"
              className="text-base font-medium"
            >
              {es.crm.compromisos.titulo}
            </label>
            <Input
              id="compromiso-form-titulo"
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="compromiso-form-fecha-limite"
              className="text-base font-medium"
            >
              {es.crm.compromisos.fechaLimite}
            </label>
            <Input
              id="compromiso-form-fecha-limite"
              type="date"
              value={fechaLimite}
              onChange={(event) => setFechaLimite(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="compromiso-form-prioridad"
              className="text-base font-medium"
            >
              {es.crm.compromisos.prioridad}
            </label>
            <Select
              value={prioridad || NONE_VALUE}
              onValueChange={(value) => setPrioridad(fromSelectValue(value))}
            >
              <SelectTrigger
                id="compromiso-form-prioridad"
                className="h-11 min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>—</SelectItem>
                {prioridadOptions.map((option) => (
                  <SelectItem key={option.codigo} value={option.codigo}>
                    {option.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
