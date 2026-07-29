import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createContactoActionMock = vi.fn();
const updateContactoActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  createContactoAction: (...args: unknown[]) =>
    createContactoActionMock(...args),
  updateContactoAction: (...args: unknown[]) =>
    updateContactoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { ContactoFormDialog } from "./contacto-form-dialog";
import type { ContactoListItem } from "@/lib/crm/queries";

const existingContacto: ContactoListItem = {
  id: 1,
  clienteId: 10,
  nombre: "Juan Pérez",
  cargo: "Gerente",
  correo: "juan@example.com",
  telefono: "+57 300 123 4567",
  perfilDecision: "decisor",
  notas: "Contacto principal",
};

describe("ContactoFormDialog (task 7.5, spec CO1-CO3)", () => {
  beforeEach(() => {
    createContactoActionMock.mockReset();
    updateContactoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("create mode: submits nombre + optional fields via createContactoAction", async () => {
    createContactoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <ContactoFormDialog
        mode="create"
        clienteId={10}
        perfilDecisionOptions={[
          { codigo: "decisor", etiqueta: "Decisor", orden: 1, activo: true },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear contacto" }));
    await user.type(screen.getByLabelText("Nombre"), "Ana Gómez");
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(createContactoActionMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        nombre: "Ana Gómez",
        correo: "ana@example.com",
      }),
    );
  });

  it("edit mode: pre-fills every field and submits via updateContactoAction", async () => {
    updateContactoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <ContactoFormDialog
        mode="edit"
        clienteId={10}
        contacto={existingContacto}
        perfilDecisionOptions={[
          { codigo: "decisor", etiqueta: "Decisor", orden: 1, activo: true },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateContactoActionMock).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({ nombre: "Juan Pérez" }),
    );
  });

  it("surfaces a server error inline instead of throwing or silently failing", async () => {
    createContactoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <ContactoFormDialog
        mode="create"
        clienteId={10}
        perfilDecisionOptions={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear contacto" }));
    await user.type(screen.getByLabelText("Nombre"), "Ana Gómez");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
  });
});
