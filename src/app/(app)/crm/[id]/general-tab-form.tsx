"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import { updateClienteGeneralAction } from "@/lib/crm/actions";
import type { ClienteDetail } from "@/lib/crm/queries";
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

interface GeneralTabFormProps {
  cliente: ClienteDetail;
  tamanoOrganizacionOptions: CatalogoOption[];
  canalContactoInicialOptions: CatalogoOption[];
  prioridadOptions: CatalogoOption[];
  nivelMadurezOptions: CatalogoOption[];
}

const NONE_VALUE = "__none__";

/** Normalizes the picker's `onValueChange` payload (base-ui allows `null`) back to the plain string state these controlled inputs use. */
function fromSelectValue(value: string | null): string {
  return value === NONE_VALUE || value === null ? "" : value;
}

/**
 * Task 6.10 (spec FC1): the ficha's General tab. Free-text/date fields
 * (`empresa`, `ubicacion`, `fechaPrimerContacto`, `prioridadesIdentificadas`,
 * `riesgosBarreras`) are plain inputs; the 4 descriptive/classification
 * fields (`tamanoOrganizacion`, `canalContactoInicial`, `prioridad`,
 * `nivelMadurez`) are catalog-backed pickers fed by `getCatalogoOptions()`
 * (task 6.2) — active codes only, per the design's picker rule.
 */
export function GeneralTabForm({
  cliente,
  tamanoOrganizacionOptions,
  canalContactoInicialOptions,
  prioridadOptions,
  nivelMadurezOptions,
}: GeneralTabFormProps) {
  const [empresa, setEmpresa] = useState(cliente.empresa ?? "");
  const [tamanoOrganizacion, setTamanoOrganizacion] = useState(
    cliente.tamanoOrganizacion ?? "",
  );
  const [ubicacion, setUbicacion] = useState(cliente.ubicacion ?? "");
  const [canalContactoInicial, setCanalContactoInicial] = useState(
    cliente.canalContactoInicial ?? "",
  );
  const [fechaPrimerContacto, setFechaPrimerContacto] = useState(
    cliente.fechaPrimerContacto ?? "",
  );
  const [prioridad, setPrioridad] = useState(cliente.prioridad ?? "");
  const [nivelMadurez, setNivelMadurez] = useState(cliente.nivelMadurez ?? "");
  const [prioridadesIdentificadas, setPrioridadesIdentificadas] = useState(
    cliente.prioridadesIdentificadas ?? "",
  );
  const [riesgosBarreras, setRiesgosBarreras] = useState(
    cliente.riesgosBarreras ?? "",
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateClienteGeneralAction(cliente.id, {
        empresa,
        tamanoOrganizacion,
        ubicacion,
        canalContactoInicial,
        fechaPrimerContacto,
        prioridad,
        nivelMadurez,
        prioridadesIdentificadas,
        riesgosBarreras,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.add({ title: es.crm.general.updateSuccess, type: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="general-empresa" className="text-base font-medium">
            {es.crm.general.empresa}
          </label>
          <Input
            id="general-empresa"
            value={empresa}
            onChange={(event) => setEmpresa(event.target.value)}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="general-tamano-organizacion"
            className="text-base font-medium"
          >
            {es.crm.general.tamanoOrganizacion}
          </label>
          <Select
            value={tamanoOrganizacion || NONE_VALUE}
            onValueChange={(value) =>
              setTamanoOrganizacion(fromSelectValue(value))
            }
          >
            <SelectTrigger
              id="general-tamano-organizacion"
              className="h-11 min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>—</SelectItem>
              {tamanoOrganizacionOptions.map((option) => (
                <SelectItem key={option.codigo} value={option.codigo}>
                  {option.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="general-ubicacion" className="text-base font-medium">
            {es.crm.general.ubicacion}
          </label>
          <Input
            id="general-ubicacion"
            value={ubicacion}
            onChange={(event) => setUbicacion(event.target.value)}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="general-canal-contacto-inicial"
            className="text-base font-medium"
          >
            {es.crm.general.canalContactoInicial}
          </label>
          <Select
            value={canalContactoInicial || NONE_VALUE}
            onValueChange={(value) =>
              setCanalContactoInicial(fromSelectValue(value))
            }
          >
            <SelectTrigger
              id="general-canal-contacto-inicial"
              className="h-11 min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>—</SelectItem>
              {canalContactoInicialOptions.map((option) => (
                <SelectItem key={option.codigo} value={option.codigo}>
                  {option.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="general-fecha-primer-contacto"
            className="text-base font-medium"
          >
            {es.crm.general.fechaPrimerContacto}
          </label>
          <Input
            id="general-fecha-primer-contacto"
            type="date"
            value={fechaPrimerContacto}
            onChange={(event) => setFechaPrimerContacto(event.target.value)}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="general-prioridad" className="text-base font-medium">
            {es.crm.general.prioridad}
          </label>
          <Select
            value={prioridad || NONE_VALUE}
            onValueChange={(value) => setPrioridad(fromSelectValue(value))}
          >
            <SelectTrigger
              id="general-prioridad"
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
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="general-nivel-madurez"
            className="text-base font-medium"
          >
            {es.crm.general.nivelMadurez}
          </label>
          <Select
            value={nivelMadurez || NONE_VALUE}
            onValueChange={(value) => setNivelMadurez(fromSelectValue(value))}
          >
            <SelectTrigger
              id="general-nivel-madurez"
              className="h-11 min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>—</SelectItem>
              {nivelMadurezOptions.map((option) => (
                <SelectItem key={option.codigo} value={option.codigo}>
                  {option.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="general-prioridades-identificadas"
          className="text-base font-medium"
        >
          {es.crm.general.prioridadesIdentificadas}
        </label>
        <Textarea
          id="general-prioridades-identificadas"
          value={prioridadesIdentificadas}
          onChange={(event) => setPrioridadesIdentificadas(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="general-riesgos-barreras"
          className="text-base font-medium"
        >
          {es.crm.general.riesgosBarreras}
        </label>
        <Textarea
          id="general-riesgos-barreras"
          value={riesgosBarreras}
          onChange={(event) => setRiesgosBarreras(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="h-11 min-h-11 w-full text-base sm:w-auto"
      >
        {isPending ? es.common.saving : es.common.save}
      </Button>
    </div>
  );
}
