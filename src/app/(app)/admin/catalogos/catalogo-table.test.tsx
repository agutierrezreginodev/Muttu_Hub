import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/actions", () => ({
  createCatalogoAction: vi.fn(),
  updateCatalogoAction: vi.fn(),
  deactivateCatalogoAction: vi.fn(),
}));

import { CatalogoTable, type CatalogoRow } from "./catalogo-table";

function makeRow(overrides: Partial<CatalogoRow> = {}): CatalogoRow {
  return {
    tipo: "nivel_madurez",
    codigo: "temprano",
    etiqueta: "Temprano",
    orden: 1,
    activo: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "Ana",
    updatedAt: "2026-07-01T00:00:00.000Z",
    updatedBy: "Ana",
    ...overrides,
  };
}

describe("CatalogoTable (task 5.7, spec CAT4)", () => {
  it("renders the empty state when there are no rows", () => {
    render(<CatalogoTable rows={[]} />);
    expect(
      screen.getByText("Todavía no hay códigos de catálogo."),
    ).toBeInTheDocument();
  });

  it("groups rows by tipo, rendering one heading per distinct tipo", () => {
    render(
      <CatalogoTable
        rows={[
          makeRow({ tipo: "nivel_madurez", codigo: "temprano" }),
          makeRow({ tipo: "nivel_madurez", codigo: "avanzado" }),
          makeRow({ tipo: "canal_contacto", codigo: "referido" }),
        ]}
      />,
    );

    expect(screen.getByText("nivel_madurez")).toBeInTheDocument();
    expect(screen.getByText("canal_contacto")).toBeInTheDocument();
    expect(screen.getByText("temprano")).toBeInTheDocument();
    expect(screen.getByText("avanzado")).toBeInTheDocument();
    expect(screen.getByText("referido")).toBeInTheDocument();
  });

  it("shows an active badge for an active row and an inactive badge for a deactivated one, and only offers deactivate on active rows", () => {
    render(
      <CatalogoTable
        rows={[
          makeRow({ codigo: "activo-row", activo: true }),
          makeRow({ codigo: "inactivo-row", activo: false }),
        ]}
      />,
    );

    const badges = screen.getAllByText(/^Activo$|^Inactivo$/);
    expect(badges).toHaveLength(2);
    // Deactivate action is offered only for the active row (CAT3: activo is
    // one-directional via the RPC, no reactivate path in this UI).
    expect(screen.getAllByRole("button", { name: "Desactivar" })).toHaveLength(
      1,
    );
  });
});
