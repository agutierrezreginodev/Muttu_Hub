import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCompromisoActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  createCompromisoAction: (...args: unknown[]) =>
    createCompromisoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { CompromisoFormDialog } from "./compromiso-form-dialog";

/**
 * Task 8.5 (spec FC9, design Decision 9): create-only dialog — there is no
 * edit mode (Compromisos is "read + create only" per this PR's scope).
 */
describe("CompromisoFormDialog (task 8.5, spec FC9)", () => {
  beforeEach(() => {
    createCompromisoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("submits titulo + optional fields via createCompromisoAction", async () => {
    createCompromisoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<CompromisoFormDialog clienteId={10} prioridadOptions={[]} />);

    await user.click(screen.getByRole("button", { name: "Crear compromiso" }));
    await user.type(screen.getByLabelText("Título"), "Enviar propuesta");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(createCompromisoActionMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ titulo: "Enviar propuesta" }),
    );
  });

  it("surfaces a server error inline instead of throwing or silently failing", async () => {
    createCompromisoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(<CompromisoFormDialog clienteId={10} prioridadOptions={[]} />);

    await user.click(screen.getByRole("button", { name: "Crear compromiso" }));
    await user.type(screen.getByLabelText("Título"), "Enviar propuesta");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
  });
});
