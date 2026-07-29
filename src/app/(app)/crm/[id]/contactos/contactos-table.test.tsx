import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/crm/actions", () => ({
  createContactoAction: vi.fn(),
  updateContactoAction: vi.fn(),
  deleteContactoAction: vi.fn(),
}));

import { ContactosTable } from "./contactos-table";
import type { ContactoListItem } from "@/lib/crm/queries";
import type { CatalogoOptionsMap } from "@/lib/crm/catalogos";

function makeContacto(
  overrides: Partial<ContactoListItem> = {},
): ContactoListItem {
  return {
    id: 1,
    clienteId: 10,
    nombre: "Juan Pérez",
    cargo: "Gerente",
    correo: "juan@example.com",
    telefono: "+57 300 123 4567",
    perfilDecision: "decisor",
    notas: null,
    ...overrides,
  };
}

function makeCatalogoOptions(): CatalogoOptionsMap {
  const map: CatalogoOptionsMap = new Map();
  map.set("perfil_decision", [
    { codigo: "decisor", etiqueta: "Decisor", orden: 1, activo: true },
  ]);
  return map;
}

describe("ContactosTable (task 7.5, spec CO1-CO6)", () => {
  it("renders the empty state when there are no contactos", () => {
    render(
      <ContactosTable
        rows={[]}
        clienteId={10}
        catalogoOptions={makeCatalogoOptions()}
      />,
    );
    expect(
      screen.getByText("Todavía no hay contactos para este cliente."),
    ).toBeInTheDocument();
  });

  it("renders one row per contacto, resolving perfilDecision to its etiqueta", () => {
    render(
      <ContactosTable
        rows={[makeContacto()]}
        clienteId={10}
        catalogoOptions={makeCatalogoOptions()}
      />,
    );
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Decisor")).toBeInTheDocument();
  });
});
