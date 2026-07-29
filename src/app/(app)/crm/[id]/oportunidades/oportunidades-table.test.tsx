import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/crm/actions", () => ({
  createOportunidadAction: vi.fn(),
  updateOportunidadAction: vi.fn(),
  deleteOportunidadAction: vi.fn(),
}));

import { OportunidadesTable } from "./oportunidades-table";
import type { OportunidadListItem } from "@/lib/crm/queries";
import type { CatalogoOptionsMap } from "@/lib/crm/catalogos";

function makeOportunidad(
  overrides: Partial<OportunidadListItem> = {},
): OportunidadListItem {
  return {
    id: 1,
    clienteId: 10,
    nombre: "Migración cloud",
    problemaDetectado: "Infraestructura obsoleta",
    solucionPropuesta: null,
    proyectosAnteriores: null,
    valorEstimadoCop: 50000000,
    estado: "abierta",
    fechaUltimaGestion: null,
    serviciosInteres: ["consultoria", "implementacion"],
    ...overrides,
  };
}

function makeCatalogoOptions(): CatalogoOptionsMap {
  const map: CatalogoOptionsMap = new Map();
  map.set("estado_oportunidad", [
    { codigo: "abierta", etiqueta: "Abierta", orden: 1, activo: true },
  ]);
  map.set("servicio_interes", [
    { codigo: "consultoria", etiqueta: "Consultoría", orden: 1, activo: true },
    {
      codigo: "implementacion",
      etiqueta: "Implementación",
      orden: 2,
      activo: true,
    },
  ]);
  return map;
}

describe("OportunidadesTable (task 7.6, spec OP1-OP5)", () => {
  it("renders the empty state when there are no oportunidades", () => {
    render(
      <OportunidadesTable
        rows={[]}
        clienteId={10}
        catalogoOptions={makeCatalogoOptions()}
      />,
    );
    expect(
      screen.getByText("Todavía no hay oportunidades para este cliente."),
    ).toBeInTheDocument();
  });

  it("renders one row per oportunidad, resolving estado and every servicio_interes code to its etiqueta", () => {
    render(
      <OportunidadesTable
        rows={[makeOportunidad()]}
        clienteId={10}
        catalogoOptions={makeCatalogoOptions()}
      />,
    );
    expect(screen.getByText("Migración cloud")).toBeInTheDocument();
    expect(screen.getByText("Abierta")).toBeInTheDocument();
    expect(screen.getByText("Consultoría")).toBeInTheDocument();
    expect(screen.getByText("Implementación")).toBeInTheDocument();
  });
});
