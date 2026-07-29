"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createContactoAction, updateContactoAction } from "@/lib/crm/actions";
import type { ContactoListItem } from "@/lib/crm/queries";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface ContactoFormDialogProps {
  mode: "create" | "edit";
  clienteId: number;
  contacto?: ContactoListItem;
  perfilDecisionOptions: CatalogoOption[];
}

const NONE_VALUE = "__none__";

function fromSelectValue(value: string | null): string {
  return value === NONE_VALUE || value === null ? "" : value;
}

/**
 * Create/edit contacto (task 7.5, spec CO1-CO3). Mirrors
 * `CatalogoFormDialog`'s explicit-object submit pattern: plain `useState` +
 * `useTransition`, calling the Server Action directly.
 */
export function ContactoFormDialog({
  mode,
  clienteId,
  contacto,
  perfilDecisionOptions,
}: ContactoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(contacto?.nombre ?? "");
  const [cargo, setCargo] = useState(contacto?.cargo ?? "");
  const [correo, setCorreo] = useState(contacto?.correo ?? "");
  const [telefono, setTelefono] = useState(contacto?.telefono ?? "");
  const [perfilDecision, setPerfilDecision] = useState(
    contacto?.perfilDecision ?? "",
  );
  const [notas, setNotas] = useState(contacto?.notas ?? "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const input = { nombre, cargo, correo, telefono, perfilDecision, notas };
      const result =
        mode === "create"
          ? await createContactoAction(clienteId, input)
          : await updateContactoAction(clienteId, contacto!.id, input);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title:
          mode === "create"
            ? es.crm.contactos.createSuccess
            : es.crm.contactos.updateSuccess,
        type: "success",
      });
      setOpen(false);
    });
  }

  const titleId = `contacto-form-title-${contacto?.id ?? "new"}`;

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
        {mode === "create" ? es.crm.contactos.createContacto : es.common.edit}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>
            {mode === "create"
              ? es.crm.contactos.createContactoTitle
              : es.crm.contactos.editContactoTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-nombre`}
              className="text-base font-medium"
            >
              {es.crm.contactos.nombre}
            </label>
            <Input
              id={`${titleId}-nombre`}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-cargo`}
              className="text-base font-medium"
            >
              {es.crm.contactos.cargo}
            </label>
            <Input
              id={`${titleId}-cargo`}
              value={cargo}
              onChange={(event) => setCargo(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-correo`}
              className="text-base font-medium"
            >
              {es.crm.contactos.correo}
            </label>
            <Input
              id={`${titleId}-correo`}
              type="email"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-telefono`}
              className="text-base font-medium"
            >
              {es.crm.contactos.telefono}
            </label>
            <Input
              id={`${titleId}-telefono`}
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-perfil-decision`}
              className="text-base font-medium"
            >
              {es.crm.contactos.perfilDecision}
            </label>
            <Select
              value={perfilDecision || NONE_VALUE}
              onValueChange={(value) =>
                setPerfilDecision(fromSelectValue(value))
              }
            >
              <SelectTrigger
                id={`${titleId}-perfil-decision`}
                className="h-11 min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>—</SelectItem>
                {perfilDecisionOptions.map((option) => (
                  <SelectItem key={option.codigo} value={option.codigo}>
                    {option.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-notas`}
              className="text-base font-medium"
            >
              {es.crm.contactos.notas}
            </label>
            <Textarea
              id={`${titleId}-notas`}
              value={notas}
              onChange={(event) => setNotas(event.target.value)}
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
