import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/kanban/actions", () => ({
  togglePromoteCompromisoAction: vi.fn(),
}));

import { CompromisosTable } from "./compromisos-table";
import { TareaTable } from "../tarea-table";
import type { TareaListItem } from "@/lib/crm/queries";

function makeCompromiso(
  overrides: Partial<TareaListItem> = {},
): TareaListItem {
  return {
    id: 1,
    titulo: "Llamada de seguimiento",
    descripcion: null,
    responsableId: null,
    fechaLimite: "2026-08-01T00:00:00Z",
    estado: "pendiente",
    prioridad: "Alta",
    vencido: false,
    origen: "CRM",
    ...overrides,
  };
}

describe("CompromisosTable (slice 9, spec KP2)", () => {
  it("shows the empty message instead of an empty table", () => {
    render(<CompromisosTable rows={[]} emptyMessage="Sin compromisos." />);

    expect(screen.getByText("Sin compromisos.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders one promote control per row", () => {
    render(
      <CompromisosTable
        rows={[
          makeCompromiso({ id: 1, origen: "CRM" }),
          makeCompromiso({ id: 2, origen: "Ambos", titulo: "Enviar propuesta" }),
        ]}
        emptyMessage="—"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Poner en el tablero" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar del tablero" }),
    ).toBeInTheDocument();
  });

  it("keeps the overdue badge rule it inherited from TareaTable", () => {
    render(
      <CompromisosTable
        rows={[makeCompromiso({ vencido: true })]}
        emptyMessage="—"
      />,
    );

    expect(screen.getByTestId("tarea-titulo-badge-1")).toHaveAttribute(
      "data-slot",
      "badge",
    );
    expect(screen.getByText("Llamada de seguimiento")).toBeInTheDocument();
  });

  it("explains that promoting does not remove the compromiso from this tab", () => {
    render(
      <CompromisosTable rows={[makeCompromiso()]} emptyMessage="—" />,
    );

    expect(
      screen.getByText(/sigue en esta pestaña/i),
    ).toBeInTheDocument();
  });
});

/**
 * The reason `CompromisosTable` exists as its own component instead of a flag
 * on `TareaTable`. `TareaTable`'s other caller is the READ-ONLY Tareas
 * relacionadas tab, and its contract is "zero interactive controls, by
 * design, for both callers". This pins that contract so a future refactor
 * that merges the two tables has to break a test rather than quietly leak a
 * promote button into a read-only view.
 */
describe("TareaTable stays free of interactive controls", () => {
  it("renders no button for a row that is already promoted", () => {
    render(
      <TareaTable
        rows={[makeCompromiso({ origen: "Ambos" })]}
        emptyMessage="—"
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
