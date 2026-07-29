"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import {
  createOportunidadAction,
  updateOportunidadAction,
} from "@/lib/crm/actions";
import type { OportunidadListItem } from "@/lib/crm/queries";
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

interface OportunidadFormDialogProps {
  mode: "create" | "edit";
  clienteId: number;
  oportunidad?: OportunidadListItem;
  /** Active `servicio_interes` catalog codes — the multi-select's offered options (task 7.6). */
  servicioOptions: CatalogoOption[];
  estadoOptions?: CatalogoOption[];
}

const NONE_VALUE = "__none__";

function fromSelectValue(value: string | null): string {
  return value === NONE_VALUE || value === null ? "" : value;
}

/**
 * Create/edit oportunidad (task 7.6, spec OP1-OP4, design Decision 6). The
 * servicios_interes multi-select is a plain array of checked codes held in
 * component state — `serviciosInteres` ALWAYS reflects the complete
 * currently-checked set. On submit this exact array is forwarded to
 * `createOportunidadAction`/`updateOportunidadAction`, which in turn
 * forward it verbatim to `set_oportunidad_servicios` (set-replace, never an
 * incremental add/remove diff — spec-required behavior, see
 * `oportunidad-form-dialog.test.tsx`).
 */
export function OportunidadFormDialog({
  mode,
  clienteId,
  oportunidad,
  servicioOptions,
  estadoOptions = [],
}: OportunidadFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(oportunidad?.nombre ?? "");
  const [problemaDetectado, setProblemaDetectado] = useState(
    oportunidad?.problemaDetectado ?? "",
  );
  const [solucionPropuesta, setSolucionPropuesta] = useState(
    oportunidad?.solucionPropuesta ?? "",
  );
  const [proyectosAnteriores, setProyectosAnteriores] = useState(
    oportunidad?.proyectosAnteriores ?? "",
  );
  const [valorEstimadoCop, setValorEstimadoCop] = useState(
    oportunidad?.valorEstimadoCop != null
      ? String(oportunidad.valorEstimadoCop)
      : "",
  );
  const [estado, setEstado] = useState(oportunidad?.estado ?? "");
  const [fechaUltimaGestion, setFechaUltimaGestion] = useState(
    oportunidad?.fechaUltimaGestion ?? "",
  );
  const [serviciosInteres, setServiciosInteres] = useState<string[]>(
    oportunidad?.serviciosInteres ?? [],
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function toggleServicio(codigo: string, checked: boolean) {
    setServiciosInteres((current) =>
      checked
        ? [...current, codigo]
        : current.filter((existing) => existing !== codigo),
    );
  }

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const input = {
        nombre,
        problemaDetectado,
        solucionPropuesta,
        proyectosAnteriores,
        valorEstimadoCop,
        estado,
        fechaUltimaGestion,
        // The full current set — never a diff. See doc comment above.
        serviciosInteres,
      };
      const result =
        mode === "create"
          ? await createOportunidadAction(clienteId, input)
          : await updateOportunidadAction(clienteId, oportunidad!.id, input);

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({
        title:
          mode === "create"
            ? es.crm.oportunidades.createSuccess
            : es.crm.oportunidades.updateSuccess,
        type: "success",
      });
      setOpen(false);
    });
  }

  const titleId = `oportunidad-form-title-${oportunidad?.id ?? "new"}`;

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
        {mode === "create"
          ? es.crm.oportunidades.createOportunidad
          : es.common.edit}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>
            {mode === "create"
              ? es.crm.oportunidades.createOportunidadTitle
              : es.crm.oportunidades.editOportunidadTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-nombre`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.nombre}
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
              htmlFor={`${titleId}-problema`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.problemaDetectado}
            </label>
            <Textarea
              id={`${titleId}-problema`}
              value={problemaDetectado}
              onChange={(event) => setProblemaDetectado(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-solucion`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.solucionPropuesta}
            </label>
            <Textarea
              id={`${titleId}-solucion`}
              value={solucionPropuesta}
              onChange={(event) => setSolucionPropuesta(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-proyectos`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.proyectosAnteriores}
            </label>
            <Textarea
              id={`${titleId}-proyectos`}
              value={proyectosAnteriores}
              onChange={(event) => setProyectosAnteriores(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-valor`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.valorEstimadoCop}
            </label>
            <Input
              id={`${titleId}-valor`}
              type="number"
              min={0}
              value={valorEstimadoCop}
              onChange={(event) => setValorEstimadoCop(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          {estadoOptions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${titleId}-estado`}
                className="text-base font-medium"
              >
                {es.crm.oportunidades.estado}
              </label>
              <Select
                value={estado || NONE_VALUE}
                onValueChange={(value) => setEstado(fromSelectValue(value))}
              >
                <SelectTrigger
                  id={`${titleId}-estado`}
                  className="h-11 min-h-11 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                  {estadoOptions.map((option) => (
                    <SelectItem key={option.codigo} value={option.codigo}>
                      {option.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${titleId}-fecha-gestion`}
              className="text-base font-medium"
            >
              {es.crm.oportunidades.fechaUltimaGestion}
            </label>
            <Input
              id={`${titleId}-fecha-gestion`}
              type="date"
              value={fechaUltimaGestion}
              onChange={(event) => setFechaUltimaGestion(event.target.value)}
              className="h-11 text-base"
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-base font-medium">
              {es.crm.oportunidades.serviciosInteres}
            </legend>
            <div className="flex flex-col gap-2">
              {servicioOptions.map((option) => {
                const inputId = `${titleId}-servicio-${option.codigo}`;
                return (
                  <div key={option.codigo} className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="h-4 w-4"
                      checked={serviciosInteres.includes(option.codigo)}
                      onChange={(event) =>
                        toggleServicio(option.codigo, event.target.checked)
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
