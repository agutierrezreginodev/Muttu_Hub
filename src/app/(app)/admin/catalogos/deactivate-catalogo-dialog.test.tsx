import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deactivateCatalogoActionMock = vi.fn();

vi.mock("@/lib/admin/actions", () => ({
  deactivateCatalogoAction: (...args: unknown[]) =>
    deactivateCatalogoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DeactivateCatalogoDialog } from "./deactivate-catalogo-dialog";

describe("DeactivateCatalogoDialog (task 5.7, spec CAT5)", () => {
  beforeEach(() => {
    deactivateCatalogoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("calls soft_delete_catalogo via deactivateCatalogoAction and confirms with a success toast on the happy path", async () => {
    deactivateCatalogoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <DeactivateCatalogoDialog
        tipo="nivel_madurez"
        codigo="temprano"
        etiqueta="Temprano"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(deactivateCatalogoActionMock).toHaveBeenCalledWith(
        "nivel_madurez",
        "temprano",
      );
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Código de catálogo desactivado.",
        type: "success",
      }),
    );
  });

  it("CAT5 rejection: surfaces the in-use error inline as a visible message, never swallows it or shows a generic/silent failure", async () => {
    deactivateCatalogoActionMock.mockResolvedValue({
      error:
        "No se puede desactivar: código en uso por un cliente o tarea existente.",
    });
    const user = userEvent.setup();

    render(
      <DeactivateCatalogoDialog
        tipo="tipo_cliente"
        codigo="pyme"
        etiqueta="PyME"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede desactivar: código en uso por un cliente o tarea existente.",
    );
    // Rejection is not a silent failure: no success toast is ever fired.
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
