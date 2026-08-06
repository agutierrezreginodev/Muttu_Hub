import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createComentarioActionMock = vi.fn();
vi.mock("@/lib/kanban/actions", () => ({
  createComentarioAction: (...args: unknown[]) =>
    createComentarioActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { ComentarioForm } from "./comentario-form";

describe("ComentarioForm (spec KM1)", () => {
  beforeEach(() => {
    createComentarioActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("appends a comment and clears the field for the next one", async () => {
    createComentarioActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ComentarioForm tareaId={7} />);

    await user.type(
      screen.getByLabelText("Nuevo comentario"),
      "Revisado con el equipo.",
    );
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    await waitFor(() => {
      expect(createComentarioActionMock).toHaveBeenCalledWith(7, {
        texto: "Revisado con el equipo.",
      });
    });
    // Create-only, and the thread is append-only: leaving the text behind would
    // invite an accidental duplicate as an "edit".
    expect(screen.getByLabelText("Nuevo comentario")).toHaveValue("");
  });

  it("has no author field — the server takes it from the session", () => {
    render(<ComentarioForm tareaId={7} />);

    // `tarea_comentario_insert` pins `autor_id = auth.uid()`, so an author input
    // could only ever be ignored or rejected.
    expect(screen.queryByLabelText("Autor")).toBeNull();
  });

  it("surfaces a server error inline and keeps what was typed", async () => {
    createComentarioActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();
    render(<ComentarioForm tareaId={7} />);

    await user.type(screen.getByLabelText("Nuevo comentario"), "Nota");
    await user.click(screen.getByRole("button", { name: "Comentar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    // Clearing on failure would throw away the user's text.
    expect(screen.getByLabelText("Nuevo comentario")).toHaveValue("Nota");
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
