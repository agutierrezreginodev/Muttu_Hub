import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCatalogoActionMock = vi.fn();
const updateCatalogoActionMock = vi.fn();

vi.mock("@/lib/admin/actions", () => ({
  createCatalogoAction: (...args: unknown[]) =>
    createCatalogoActionMock(...args),
  updateCatalogoAction: (...args: unknown[]) =>
    updateCatalogoActionMock(...args),
}));

import { CatalogoFormDialog } from "./catalogo-form-dialog";
import type { CatalogoRow } from "./catalogo-table";

const existingRow: CatalogoRow = {
  tipo: "nivel_madurez",
  codigo: "temprano",
  etiqueta: "Temprano",
  orden: 1,
  activo: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  createdBy: "Ana",
  updatedAt: "2026-07-01T00:00:00.000Z",
  updatedBy: "Ana",
};

describe("CatalogoFormDialog (task 5.7, spec CAT4)", () => {
  beforeEach(() => {
    createCatalogoActionMock.mockReset();
    updateCatalogoActionMock.mockReset();
  });

  it("create mode: renders tipo/codigo/etiqueta/orden inputs and submits via createCatalogoAction (any tipo, zero migrations)", async () => {
    createCatalogoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<CatalogoFormDialog mode="create" />);

    await user.click(screen.getByRole("button", { name: "Crear código" }));

    await user.type(screen.getByLabelText("Tipo"), "servicio_interes");
    await user.type(screen.getByLabelText("Código"), "consultoria");
    await user.type(screen.getByLabelText("Etiqueta"), "Consultoría");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createCatalogoActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "servicio_interes",
          codigo: "consultoria",
          etiqueta: "Consultoría",
        }),
      );
    });
  });

  it("edit mode: never renders tipo/codigo as editable inputs (natural-key PK, DB grant excludes them)", async () => {
    const user = userEvent.setup();
    render(<CatalogoFormDialog mode="edit" catalogo={existingRow} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.queryByLabelText("Tipo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
    expect(screen.getByText(/nivel_madurez/)).toBeInTheDocument();
    expect(screen.getByText(/temprano/)).toBeInTheDocument();
    expect(screen.getByLabelText("Etiqueta")).toHaveValue("Temprano");
  });

  it("surfaces a server error inline instead of throwing or silently failing", async () => {
    createCatalogoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(<CatalogoFormDialog mode="create" />);
    await user.click(screen.getByRole("button", { name: "Crear código" }));
    await user.type(screen.getByLabelText("Tipo"), "servicio_interes");
    await user.type(screen.getByLabelText("Código"), "consultoria");
    await user.type(screen.getByLabelText("Etiqueta"), "Consultoría");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
  });
});
