import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteTareaActionMock = vi.fn();

vi.mock("@/lib/kanban/actions", () => ({
  deleteTareaAction: (...args: unknown[]) => deleteTareaActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DeleteTareaDialog } from "./delete-tarea-dialog";

describe("DeleteTareaDialog (slice 5a, spec KT3)", () => {
  beforeEach(() => {
    deleteTareaActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("soft-deletes the tarea and confirms with a success toast", async () => {
    deleteTareaActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<DeleteTareaDialog tareaId={42} titulo="Revisar contrato marco" />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(deleteTareaActionMock).toHaveBeenCalledWith(42);
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarea eliminada.", type: "success" }),
    );
  });

  it("names the tarea being deleted, so the wrong card is not confirmed blindly", async () => {
    const user = userEvent.setup();

    render(<DeleteTareaDialog tareaId={42} titulo="Revisar contrato marco" />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(screen.getByText("Revisar contrato marco")).toBeInTheDocument();
    expect(deleteTareaActionMock).not.toHaveBeenCalled();
  });

  it("surfaces a server error inline, never a silent failure", async () => {
    deleteTareaActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(<DeleteTareaDialog tareaId={42} titulo="Revisar contrato marco" />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
