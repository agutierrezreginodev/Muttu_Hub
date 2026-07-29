import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addBitacoraEntryActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  addBitacoraEntryAction: (...args: unknown[]) =>
    addBitacoraEntryActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { BitacoraForm } from "./bitacora-form";

/**
 * Task 8.4 (spec BIT4/BIT5): the create-only append form. There is no
 * `autorId` input anywhere in this component — `addBitacoraEntryAction`
 * forces it server-side from the session, never from client input.
 */
describe("BitacoraForm (task 8.4, spec BIT4/BIT5)", () => {
  beforeEach(() => {
    addBitacoraEntryActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("disables the submit button while texto is empty", () => {
    render(<BitacoraForm clienteId={10} />);
    expect(
      screen.getByRole("button", { name: "Agregar entrada" }),
    ).toBeDisabled();
  });

  it("submits texto (and ONLY texto — no autorId field exists) via addBitacoraEntryAction", async () => {
    addBitacoraEntryActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<BitacoraForm clienteId={10} />);
    await user.type(
      screen.getByLabelText("Nueva entrada"),
      "Llamada de seguimiento",
    );
    await user.click(screen.getByRole("button", { name: "Agregar entrada" }));

    expect(addBitacoraEntryActionMock).toHaveBeenCalledWith(10, {
      texto: "Llamada de seguimiento",
    });
  });

  it("clears the textarea and shows a success toast after a successful submit", async () => {
    addBitacoraEntryActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<BitacoraForm clienteId={10} />);
    const textarea = screen.getByLabelText("Nueva entrada");
    await user.type(textarea, "Nota");
    await user.click(screen.getByRole("button", { name: "Agregar entrada" }));

    expect(await screen.findByText("Nueva entrada")).toBeInTheDocument();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Entrada agregada a la bitácora." }),
    );
    expect(textarea).toHaveValue("");
  });

  it("surfaces a server error inline instead of throwing or silently failing", async () => {
    addBitacoraEntryActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(<BitacoraForm clienteId={10} />);
    await user.type(screen.getByLabelText("Nueva entrada"), "Nota");
    await user.click(screen.getByRole("button", { name: "Agregar entrada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
  });
});
