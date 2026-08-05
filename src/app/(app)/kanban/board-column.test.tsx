import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BoardColumn, type BoardColumnData } from "./board-column";
import type { KanbanCardData } from "./tarea-card";
import type { TareaFormOptions } from "./tarea-form-dialog";

const FORM_OPTIONS: TareaFormOptions = {
  usuarioOptions: [],
  prioridadOptions: [],
  etiquetaOptions: [],
  defaultResponsableId: "user-1",
};

function makeCard(overrides: Partial<KanbanCardData> = {}): KanbanCardData {
  return {
    id: 1,
    titulo: "A",
    descripcion: null,
    responsableId: null,
    responsableLabel: "\u2014",
    clienteId: null,
    fechaLimite: null,
    prioridad: null,
    etiquetas: [],
    vencido: false,
    ...overrides,
  };
}

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
    render(
      <BoardColumn
        column={makeColumn({ etiqueta: "En curso" })}
        formOptions={FORM_OPTIONS}
      />,
    );
    expect(screen.getByText("En curso")).toBeInTheDocument();
  });

  it("renders the tarea count", () => {
    render(
      <BoardColumn
        column={makeColumn({
          tareas: [
            makeCard({ id: 1, titulo: "A" }),
            makeCard({ id: 2, titulo: "B" }),
          ],
        })}
        formOptions={FORM_OPTIONS}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the empty-state message when there are zero tareas", () => {
    render(
      <BoardColumn
        column={makeColumn({ tareas: [] })}
        formOptions={FORM_OPTIONS}
      />,
    );
    expect(
      screen.getByText("No hay tareas en esta columna."),
    ).toBeInTheDocument();
  });

  it("renders one card per tarea and NOT the empty state when tareas exist — proves the map actually iterates", () => {
    render(
      <BoardColumn
        column={makeColumn({
          tareas: [
            makeCard({
              titulo: "Preparar propuesta",
              responsableLabel: "María Pérez",
            }),
          ],
        })}
        formOptions={FORM_OPTIONS}
      />,
    );
    expect(screen.getByText("Preparar propuesta")).toBeInTheDocument();
    expect(
      screen.queryByText("No hay tareas en esta columna."),
    ).not.toBeInTheDocument();
  });
});
