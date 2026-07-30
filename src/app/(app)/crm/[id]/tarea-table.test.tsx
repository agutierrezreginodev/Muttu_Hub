import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TareaTable } from "./tarea-table";
import type { TareaListItem } from "@/lib/crm/queries";

function makeTarea(overrides: Partial<TareaListItem> = {}): TareaListItem {
  return {
    id: 1,
    titulo: "Llamada de seguimiento",
    descripcion: null,
    responsableId: null,
    fechaLimite: "2026-08-01T00:00:00Z",
    estado: "pendiente",
    prioridad: "Alta",
    vencido: false,
    ...overrides,
  };
}

/**
 * Shared presentational table for Compromisos (task 8.5) and Tareas
 * relacionadas (task 8.6, READ-ONLY) — both read from `v_tarea` (spec FC9),
 * only the origen filter differs at the query layer
 * (src/lib/crm/queries.ts). This component itself renders zero
 * create/edit/delete affordance — that is composed by each page
 * separately (Compromisos adds a create dialog above the table; Tareas
 * relacionadas adds nothing at all).
 */
describe("TareaTable (tasks 8.5/8.6, spec FC9)", () => {
  it("renders the given empty-state message when there are no rows", () => {
    render(<TareaTable rows={[]} emptyMessage="Sin filas." />);
    expect(screen.getByText("Sin filas.")).toBeInTheDocument();
  });

  it("renders one row per tarea", () => {
    render(<TareaTable rows={[makeTarea()]} emptyMessage="Sin filas." />);
    expect(screen.getByText("Llamada de seguimiento")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("renders WITHOUT destructive styling when vencido is false", () => {
    render(
      <TareaTable rows={[makeTarea({ vencido: false })]} emptyMessage="—" />,
    );
    const badge = screen.getByTestId("tarea-titulo-badge-1");
    expect(badge.className).not.toMatch(/bg-destructive/);
  });

  it("renders WITH destructive (red) styling when v_tarea.vencido is true", () => {
    render(
      <TareaTable rows={[makeTarea({ vencido: true })]} emptyMessage="—" />,
    );
    const badge = screen.getByTestId("tarea-titulo-badge-1");
    expect(badge.className).toMatch(/bg-destructive/);
  });

  it("renders NO create/edit/delete affordance of its own — zero buttons", () => {
    render(<TareaTable rows={[makeTarea()]} emptyMessage="—" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
