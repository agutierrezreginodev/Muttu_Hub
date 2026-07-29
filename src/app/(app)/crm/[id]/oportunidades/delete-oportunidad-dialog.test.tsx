import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteOportunidadActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  deleteOportunidadAction: (...args: unknown[]) =>
    deleteOportunidadActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DeleteOportunidadDialog } from "./delete-oportunidad-dialog";

describe("DeleteOportunidadDialog (task 7.6, spec OP2)", () => {
  beforeEach(() => {
    deleteOportunidadActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("calls soft_delete_oportunidad via deleteOportunidadAction and confirms with a success toast", async () => {
    deleteOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <DeleteOportunidadDialog
        clienteId={10}
        oportunidadId={1}
        nombre="Migración cloud"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(deleteOportunidadActionMock).toHaveBeenCalledWith(10, 1);
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Oportunidad eliminada.",
        type: "success",
      }),
    );
  });

  it("surfaces a server error inline, never a silent failure", async () => {
    deleteOportunidadActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <DeleteOportunidadDialog
        clienteId={10}
        oportunidadId={1}
        nombre="Migración cloud"
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
