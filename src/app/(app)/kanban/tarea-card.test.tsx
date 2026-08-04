import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TareaCard, type KanbanCardData } from "./tarea-card";

function makeTarea(overrides: Partial<KanbanCardData> = {}): KanbanCardData {
  return {
    id: 1,
    titulo: "Preparar propuesta",
    responsableLabel: "María Pérez",
    fechaLimite: "2026-08-05T00:00:00Z",
    prioridad: "Alta",
    etiquetas: ["comercial"],
    vencido: false,
    ...overrides,
  };
}

/**
 * Slice 4b (tasks: sdd/kanban-module/tasks, design part 2 §12 + spec KB4).
 * `vencido` is asserted via the presence/absence of the "Vencida" badge TEXT
 * (`es.kanban.tarjeta.vencida`) — never via a CSS class/variant assertion
 * (Strict TDD's Implementation Detail Coupling Rule bans className
 * assertions; this deliberately diverges from `tarea-table.test.tsx`'s older
 * `badge.className` pattern for that reason).
 */
describe("TareaCard (slice 4b, design part 2 §12 + spec KB4)", () => {
  it("renders titulo and responsable label", () => {
    render(<TareaCard tarea={makeTarea()} />);
    expect(screen.getByText("Preparar propuesta")).toBeInTheDocument();
    expect(screen.getByText("María Pérez")).toBeInTheDocument();
  });

  it("shows the Vencida badge when vencido is true, read directly from the prop", () => {
    render(<TareaCard tarea={makeTarea({ vencido: true })} />);
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });

  it("does NOT show the Vencida badge when vencido is false", () => {
    render(<TareaCard tarea={makeTarea({ vencido: false })} />);
    expect(screen.queryByText("Vencida")).not.toBeInTheDocument();
  });

  it('shows "Sin fecha" when fechaLimite is null', () => {
    render(<TareaCard tarea={makeTarea({ fechaLimite: null })} />);
    expect(screen.getByText("Sin fecha")).toBeInTheDocument();
  });

  it("renders the formatted fechaLimite when present, not the sin-fecha placeholder", () => {
    render(
      <TareaCard tarea={makeTarea({ fechaLimite: "2026-08-05T00:00:00Z" })} />,
    );
    expect(screen.queryByText("Sin fecha")).not.toBeInTheDocument();
    // Asserts a real d/m/yyyy-shaped date rendered from the prop, without
    // pinning the exact day number — toLocaleDateString("es-CO") shifts by a
    // day depending on the machine's local timezone offset from the UTC
    // midnight fixture above, which is not the behavior under test here.
    expect(screen.getByTestId("tarea-fecha-limite")).toHaveTextContent(
      /^\d{1,2}\/\d{1,2}\/2026$/,
    );
  });

  it("renders the prioridad badge text", () => {
    render(<TareaCard tarea={makeTarea({ prioridad: "Alta" })} />);
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("renders no prioridad badge when prioridad is null", () => {
    render(<TareaCard tarea={makeTarea({ prioridad: null })} />);
    expect(screen.queryByText("Alta")).not.toBeInTheDocument();
  });

  it("renders one badge per etiqueta — proves the loop actually iterates, not a ghost loop", () => {
    render(
      <TareaCard tarea={makeTarea({ etiquetas: ["comercial", "interno"] })} />,
    );
    expect(screen.getByText("comercial")).toBeInTheDocument();
    expect(screen.getByText("interno")).toBeInTheDocument();
  });

  it("renders no etiqueta badges when the etiquetas array is empty", () => {
    render(<TareaCard tarea={makeTarea({ etiquetas: [] })} />);
    expect(screen.queryByText("comercial")).not.toBeInTheDocument();
  });
});
