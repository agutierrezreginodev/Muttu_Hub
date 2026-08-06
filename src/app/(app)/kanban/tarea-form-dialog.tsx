"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { createTareaAction, updateTareaAction } from "@/lib/kanban/actions";
import type { CatalogoPickerOption } from "@/lib/kanban/columnas";
import type { UsuarioOption } from "@/lib/admin/directory-options";
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

/** The editable subset of a board card, as `listBoardTareas` returns it. */
export interface TareaFormValues {
  id: number;
  titulo: string;
  descripcion: string | null;
  responsableId: string | null;
  clienteId: number | null;
  fechaLimite: string | null;
  prioridad: string | null;
  etiquetas: string[];
}

/**
 * Everything the form needs that is NOT the row itself. Grouped into one object
 * so the board can thread it down (board -> column -> card) as a single prop
 * instead of four parallel ones.
 */
export interface TareaFormOptions {
  usuarioOptions: UsuarioOption[];
  prioridadOptions: CatalogoPickerOption[];
  /** ACTIVE `etiqueta_tarea` codes only — a retired tag is never offered (D4). */
  etiquetaOptions: CatalogoPickerOption[];
  /** Current user: create defaults the responsable instead of asking (spec KT1). */
  defaultResponsableId: string;
}

interface TareaFormDialogProps extends TareaFormOptions {
  mode: "create" | "edit";
  tarea?: TareaFormValues;
}

const NONE_VALUE = "__none__";

function fromSelectValue(value: string | null): string {
  return value === NONE_VALUE || value === null ? "" : value;
}

/**
 * `fecha_limite` is a timestamptz, and `<input type="date">` holds YYYY-MM-DD
 * only: given anything else it renders EMPTY, and an empty date field submits
 * as "clear this field". Prefilling the raw column value would therefore wipe
 * the deadline of every tarea anyone edits — so the date part is taken here.
 */
function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * Create/edit a board card (slice 5a, spec KT1/KT2). Mirrors
 * `OportunidadFormDialog`'s mode switch and its "state always holds the
 * COMPLETE checked set" rule for the multi-value field: `etiquetas` is
 * forwarded whole, never as an add/remove diff, because the action replaces
 * the stored array outright.
 *
 * `responsable` is required by spec KT1, but the form never blocks on it: it
 * defaults to the current user, since PRD §5.3 forbids an ownerless card and
 * Kanban never writes the one estado (`borrador`) that would permit it.
 *
 * `clienteId` has no field of its own — Kanban does not reassign a card's
 * cliente — but it IS carried through the payload, or every edit would
 * silently detach the tarea from its cliente.
 */
export function TareaFormDialog({
  mode,
  tarea,
  usuarioOptions,
  prioridadOptions,
  etiquetaOptions,
  defaultResponsableId,
}: TareaFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(tarea?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? "");
  const [responsableId, setResponsableId] = useState(
    tarea?.responsableId ?? defaultResponsableId,
  );
  const [fechaLimite, setFechaLimite] = useState(
    toDateInputValue(tarea?.fechaLimite ?? null),
  );
  const [prioridad, setPrioridad] = useState(tarea?.prioridad ?? "");
  const [etiquetas, setEtiquetas] = useState<string[]>(tarea?.etiquetas ?? []);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function toggleEtiqueta(codigo: string, checked: boolean) {
    setEtiquetas((current) =>
      checked
        ? [...current, codigo]
        : current.filter((existing) => existing !== codigo),
    );
  }

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const input = {
        titulo,
        descripcion,
        responsableId,
        fechaLimite,
        prioridad,
        etiquetas,
        clienteId: tarea?.clienteId ?? undefined,
      };
      const result =
        mode === "create"
          ? await createTareaAction(input)
          : await updateTareaAction(tarea!.id, input);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title:
          mode === "create"
            ? es.kanban.tarjeta.createSuccess
            : es.kanban.tarjeta.updateSuccess,
        type: "success",
      });
      setOpen(false);
      if (mode === "create") {
        setTitulo("");
        setDescripcion("");
        setResponsableId(defaultResponsableId);
        setFechaLimite("");
        setPrioridad("");
        setEtiquetas([]);
      }
    });
  }

  const fieldId = `tarea-form-${tarea?.id ?? "new"}`;

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
        {mode === "create" ? es.kanban.tarjeta.crear : es.common.edit}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={`${fieldId}-title`}>
            {mode === "create"
              ? es.kanban.tarjeta.crearTitulo
              : es.kanban.tarjeta.editarTitulo}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-titulo`}
              className="text-base font-medium"
            >
              {es.kanban.tarjeta.titulo}
            </label>
            <Input
              id={`${fieldId}-titulo`}
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              required
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-descripcion`}
              className="text-base font-medium"
            >
              {es.kanban.tarjeta.descripcion}
            </label>
            <Textarea
              id={`${fieldId}-descripcion`}
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              className="text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-responsable`}
              className="text-base font-medium"
            >
              {es.kanban.tarjeta.responsable}
            </label>
            <Select
              value={responsableId || NONE_VALUE}
              onValueChange={(value) =>
                setResponsableId(fromSelectValue(value))
              }
            >
              <SelectTrigger
                id={`${fieldId}-responsable`}
                className="h-11 min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usuarioOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-fecha-limite`}
              className="text-base font-medium"
            >
              {es.kanban.tarjeta.fechaLimite}
            </label>
            <Input
              id={`${fieldId}-fecha-limite`}
              type="date"
              value={fechaLimite}
              onChange={(event) => setFechaLimite(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-prioridad`}
              className="text-base font-medium"
            >
              {es.kanban.tarjeta.prioridad}
            </label>
            <Select
              value={prioridad || NONE_VALUE}
              onValueChange={(value) => setPrioridad(fromSelectValue(value))}
            >
              <SelectTrigger
                id={`${fieldId}-prioridad`}
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
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-base font-medium">
              {es.kanban.tarjeta.etiquetas}
            </legend>
            <div className="flex flex-col gap-2 pt-1.5">
              {etiquetaOptions.map((option) => {
                const inputId = `${fieldId}-etiqueta-${option.codigo}`;
                return (
                  <div key={option.codigo} className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="h-4 w-4"
                      checked={etiquetas.includes(option.codigo)}
                      onChange={(event) =>
                        toggleEtiqueta(option.codigo, event.target.checked)
                      }
                    />
                    <label htmlFor={inputId} className="text-sm">
                      {option.etiqueta}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
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
