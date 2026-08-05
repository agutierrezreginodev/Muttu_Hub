import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";
import type { KanbanCardData } from "./tarea-card";
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

const moveTareaActionMock = vi.fn();
vi.mock("@/lib/kanban/actions", () => ({
  moveTareaAction: (...args: unknown[]) => moveTareaActionMock(...args),
  createTareaAction: vi.fn(),
  updateTareaAction: vi.fn(),
  deleteTareaAction: vi.fn(),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

function makeCard(overrides: Partial<KanbanCardData> = {}): KanbanCardData {
  return {
    id: 1,
    titulo: "Preparar propuesta",
    descripcion: null,
    responsableId: null,
    responsableLabel: "—",
    clienteId: null,
    fechaLimite: null,
    prioridad: null,
    etiquetas: [],
    vencido: false,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const TWO_COLUMNS: BoardColumnData[] = [
  {
    codigo: "por_hacer",
    etiqueta: "Por hacer",
    tareas: [makeCard({ id: 1, titulo: "Preparar propuesta" })],
  },
  { codigo: "cumplido", etiqueta: "Completada", tareas: [] },
];

function columnFor(etiqueta: string) {
  return screen.getByRole("region", { name: etiqueta });
}

describe("KanbanBoard move dispatch (slice 5b, design D9/§6)", () => {
  beforeEach(() => {
    moveTareaActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("dropping a card on another column dispatches the move", async () => {
    moveTareaActionMock.mockResolvedValue({ success: true });
    render(<KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />);

    fireEvent.dragStart(screen.getByTestId("tarea-drag-1"));
    fireEvent.drop(columnFor("Completada"));

    await waitFor(() => {
      expect(moveTareaActionMock).toHaveBeenCalledWith({
        tareaId: 1,
        columnaDestino: "cumplido",
      });
    });
  });

  it("moves the card in the UI before the server answers", async () => {
    let resolveMove: (value: { success: true }) => void = () => {};
    moveTareaActionMock.mockReturnValue(
      new Promise<{ success: true }>((resolve) => {
        resolveMove = resolve;
      }),
    );
    render(<KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />);

    fireEvent.dragStart(screen.getByTestId("tarea-drag-1"));
    fireEvent.drop(columnFor("Completada"));

    // The whole point of the optimistic write: the card is in its destination
    // while the round trip is still in flight, not after it.
    await waitFor(() => {
      expect(columnFor("Completada")).toContainElement(
        screen.getByTestId("tarea-card-1"),
      );
    });

    resolveMove({ success: true });
  });

  it("puts the card back and says so when the server rejects the move", async () => {
    moveTareaActionMock.mockResolvedValue({
      error: "Esa columna ya no está activa.",
    });
    render(<KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />);

    fireEvent.dragStart(screen.getByTestId("tarea-drag-1"));
    fireEvent.drop(columnFor("Completada"));

    // A silently-reverting card would read as "the drop didn't register";
    // a card left in the wrong column would be a lie about persisted state.
    await waitFor(() => {
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Esa columna ya no está activa.",
          type: "error",
        }),
      );
    });
    expect(columnFor("Por hacer")).toContainElement(
      screen.getByTestId("tarea-card-1"),
    );
  });

  it("does not dispatch when a card is dropped on the column it already sits in", () => {
    render(<KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />);

    fireEvent.dragStart(screen.getByTestId("tarea-drag-1"));
    fireEvent.drop(columnFor("Por hacer"));

    expect(moveTareaActionMock).not.toHaveBeenCalled();
  });

  it("adopts fresh server columns after a revalidation", () => {
    const { rerender } = render(
      <KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />,
    );

    // `revalidatePath` re-renders this client component with new props. Holding
    // the first `columns` in state forever would strand the board on a stale
    // snapshot: a card created, edited or deleted elsewhere would not appear
    // until a full page load.
    rerender(
      <KanbanBoard
        columns={[
          {
            codigo: "por_hacer",
            etiqueta: "Por hacer",
            tareas: [makeCard({ id: 2, titulo: "Tarea nueva del servidor" })],
          },
          { codigo: "cumplido", etiqueta: "Completada", tareas: [] },
        ]}
        formOptions={FORM_OPTIONS}
      />,
    );

    expect(screen.getByText("Tarea nueva del servidor")).toBeInTheDocument();
    expect(screen.queryByText("Preparar propuesta")).not.toBeInTheDocument();
  });

  it("dispatches the same move from the Mover a… menu (touch/keyboard path)", async () => {
    moveTareaActionMock.mockResolvedValue({ success: true });
    render(<KanbanBoard columns={TWO_COLUMNS} formOptions={FORM_OPTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Mover a…" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Completada" }));

    // Design D9: drag and menu are two doors into ONE action, so the sync rule
    // cannot be bypassed by using the accessible path.
    await waitFor(() => {
      expect(moveTareaActionMock).toHaveBeenCalledWith({
        tareaId: 1,
        columnaDestino: "cumplido",
      });
    });
  });
});
