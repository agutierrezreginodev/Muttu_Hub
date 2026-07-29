import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteContactoActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  deleteContactoAction: (...args: unknown[]) =>
    deleteContactoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DeleteContactoDialog } from "./delete-contacto-dialog";

describe("DeleteContactoDialog (task 7.5, spec CO4)", () => {
  beforeEach(() => {
    deleteContactoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("calls soft_delete_contacto via deleteContactoAction and confirms with a success toast", async () => {
    deleteContactoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <DeleteContactoDialog
        clienteId={10}
        contactoId={1}
        nombre="Juan Pérez"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(deleteContactoActionMock).toHaveBeenCalledWith(10, 1);
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Contacto eliminado.",
        type: "success",
      }),
    );
  });

  it("surfaces a server error inline, never a silent failure", async () => {
    deleteContactoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <DeleteContactoDialog
        clienteId={10}
        contactoId={1}
        nombre="Juan Pérez"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
