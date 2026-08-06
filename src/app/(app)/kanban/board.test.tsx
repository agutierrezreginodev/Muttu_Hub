import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";
import type { TareaFormOptions } from "./tarea-form-dialog";

const FORM_OPTIONS: TareaFormOptions = {
  usuarioOptions: [],
  prioridadOptions: [],
  etiquetaOptions: [],
  defaultResponsableId: "user-1",
};

/**
 * Slice 4b (tasks: sdd/kanban-module/tasks, design part 2 §12 — "DnD
 * orchestrator scaffold: state only in this slice; drop dispatch wired in
 * 5b"). This test only proves the state-lifted `columns` prop renders one
 * `BoardColumn` per entry — drag handlers and `moveTareaAction` land in 5b.
 */
describe("KanbanBoard (slice 4b, DnD orchestrator scaffold)", () => {
  it("renders one column header per entry in columns", () => {
    const columns: BoardColumnData[] = [
      { codigo: "por_hacer", etiqueta: "Por hacer", tareas: [] },
      { codigo: "en_curso", etiqueta: "En curso", tareas: [] },
      { codigo: "en_revision", etiqueta: "En revisión", tareas: [] },
    ];

    render(<KanbanBoard columns={columns} formOptions={FORM_OPTIONS} />);

    expect(screen.getByText("Por hacer")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("En revisión")).toBeInTheDocument();
  });

  it("renders zero columns when given an empty array — proves the map is not a ghost loop elsewhere", () => {
    render(<KanbanBoard columns={[]} formOptions={FORM_OPTIONS} />);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });
});
