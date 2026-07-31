import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BoardColumn, type BoardColumnData } from "./board-column";

function makeColumn(overrides: Partial<BoardColumnData> = {}): BoardColumnData {
  return {
    codigo: "por_hacer",
    etiqueta: "Por hacer",
    tareas: [],
    ...overrides,
  };
}

/**
 * Slice 4b (tasks: sdd/kanban-module/tasks, design part 2 §12, spec KB1).
 * Drop-target wiring (`onDragOver`/`onDrop`) is deferred to slice 5b — this
 * slice only covers header/count render and the empty state.
 */
describe("BoardColumn (slice 4b, design part 2 §12)", () => {
  it("renders the column etiqueta as its header", () => {
    render(<BoardColumn column={makeColumn({ etiqueta: "En curso" })} />);
    expect(screen.getByText("En curso")).toBeInTheDocument();
  });

  it("renders the tarea count", () => {
    render(
      <BoardColumn
        column={makeColumn({
          tareas: [
            {
              id: 1,
              titulo: "A",
              responsableLabel: "—",
              fechaLimite: null,
              prioridad: null,
              etiquetas: [],
              vencido: false,
            },
            {
              id: 2,
              titulo: "B",
              responsableLabel: "—",
              fechaLimite: null,
              prioridad: null,
              etiquetas: [],
              vencido: false,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the empty-state message when there are zero tareas", () => {
    render(<BoardColumn column={makeColumn({ tareas: [] })} />);
    expect(
      screen.getByText("No hay tareas en esta columna."),
    ).toBeInTheDocument();
  });

  it("renders one card per tarea and NOT the empty state when tareas exist — proves the map actually iterates", () => {
    render(
      <BoardColumn
        column={makeColumn({
          tareas: [
            {
              id: 1,
              titulo: "Preparar propuesta",
              responsableLabel: "María Pérez",
              fechaLimite: null,
              prioridad: null,
              etiquetas: [],
              vencido: false,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Preparar propuesta")).toBeInTheDocument();
    expect(
      screen.queryByText("No hay tareas en esta columna."),
    ).not.toBeInTheDocument();
  });
});
