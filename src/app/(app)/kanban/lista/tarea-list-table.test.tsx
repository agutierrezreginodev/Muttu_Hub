import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TareaListTable, type TareaListRow } from "./tarea-list-table";

function makeRow(overrides: Partial<TareaListRow> = {}): TareaListRow {
  return {
    id: 1,
    titulo: "Revisar contrato marco",
    responsableLabel: "Ana Torres",
    clienteLabel: "Grupo Andino",
    columnaLabel: "Por hacer",
    fechaLimite: "2026-09-01T00:00:00Z",
    prioridad: "Alta",
    etiquetas: ["comercial"],
    vencido: false,
    ...overrides,
  };
}

describe("TareaListTable (spec KV1 — the same rows, as a table)", () => {
  it("renders one row per tarea", () => {
    render(
      <TareaListTable
        rows={[
          makeRow({ id: 1, titulo: "Primera" }),
          makeRow({ id: 2, titulo: "Segunda" }),
        ]}
      />,
    );

    expect(screen.getByText("Primera")).toBeInTheDocument();
    expect(screen.getByText("Segunda")).toBeInTheDocument();
    // Header row plus two data rows — proves the map iterates rather than
    // rendering the first row only.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("links each título to the tarea detail", () => {
    render(<TareaListTable rows={[makeRow({ id: 7 })]} />);

    expect(
      screen.getByRole("link", { name: "Revisar contrato marco" }),
    ).toHaveAttribute("href", "/kanban/7");
  });

  it("shows the Vencida badge from the prop, never recomputed", () => {
    render(<TareaListTable rows={[makeRow({ vencido: true })]} />);
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });

  it("does not show the Vencida badge when the row is not overdue", () => {
    render(<TareaListTable rows={[makeRow({ vencido: false })]} />);
    expect(screen.queryByText("Vencida")).not.toBeInTheDocument();
  });

  it("renders the column the card sits in, so the table is not blind to the board", () => {
    render(
      <TareaListTable rows={[makeRow({ columnaLabel: "En revisión" })]} />,
    );
    expect(screen.getByText("En revisión")).toBeInTheDocument();
  });

  it("falls back to a dash for every optional field instead of rendering blanks", () => {
    render(
      <TareaListTable
        rows={[
          makeRow({
            clienteLabel: null,
            fechaLimite: null,
            prioridad: null,
            etiquetas: [],
          }),
        ]}
      />,
    );

    // An empty cell is indistinguishable from a broken render; a dash says
    // "there is nothing here" on purpose.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows an empty state rather than a headerless table when nothing matches", () => {
    render(<TareaListTable rows={[]} />);

    // Reached both by a filter that matches nothing and by a caller RLS shows
    // nothing to — spec KV1's "empty list, never an error".
    expect(screen.getByText("No hay tareas para mostrar.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
