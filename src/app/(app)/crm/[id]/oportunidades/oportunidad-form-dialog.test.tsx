import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createOportunidadActionMock = vi.fn();
const updateOportunidadActionMock = vi.fn();

vi.mock("@/lib/crm/actions", () => ({
  createOportunidadAction: (...args: unknown[]) =>
    createOportunidadActionMock(...args),
  updateOportunidadAction: (...args: unknown[]) =>
    updateOportunidadActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { OportunidadFormDialog } from "./oportunidad-form-dialog";
import type { OportunidadListItem } from "@/lib/crm/queries";

const servicioOptions = [
  { codigo: "consultoria", etiqueta: "Consultoría", orden: 1, activo: true },
  { codigo: "capacitacion", etiqueta: "Capacitación", orden: 2, activo: true },
  {
    codigo: "implementacion",
    etiqueta: "Implementación",
    orden: 3,
    activo: true,
  },
];

const existingOportunidad: OportunidadListItem = {
  id: 1,
  clienteId: 10,
  nombre: "Migración cloud",
  problemaDetectado: "Infraestructura obsoleta",
  solucionPropuesta: "Migrar a la nube",
  proyectosAnteriores: null,
  valorEstimadoCop: 50000000,
  estado: "abierta",
  fechaUltimaGestion: null,
  serviciosInteres: ["consultoria", "capacitacion"],
};

describe("OportunidadFormDialog (task 7.6, spec OP1-OP4, design Decision 6)", () => {
  beforeEach(() => {
    createOportunidadActionMock.mockReset();
    updateOportunidadActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("create mode: submits nombre + empty serviciosInteres by default", async () => {
    createOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="create"
        clienteId={10}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));
    await user.type(screen.getByLabelText("Nombre"), "Nueva oportunidad");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(createOportunidadActionMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        nombre: "Nueva oportunidad",
        serviciosInteres: [],
      }),
    );
  });

  it("create mode: checking multiple servicios sends the full array", async () => {
    createOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="create"
        clienteId={10}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));
    await user.type(screen.getByLabelText("Nombre"), "Nueva oportunidad");
    await user.click(screen.getByLabelText("Consultoría"));
    await user.click(screen.getByLabelText("Implementación"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(createOportunidadActionMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        serviciosInteres: expect.arrayContaining([
          "consultoria",
          "implementacion",
        ]),
      }),
    );
    const call = createOportunidadActionMock.mock.calls[0][1];
    expect(call.serviciosInteres).toHaveLength(2);
  });

  it("edit mode: pre-checks the existing servicios_interes codes", async () => {
    updateOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="edit"
        clienteId={10}
        oportunidad={existingOportunidad}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Consultoría")).toBeChecked();
    expect(screen.getByLabelText("Capacitación")).toBeChecked();
    expect(screen.getByLabelText("Implementación")).not.toBeChecked();
  });

  it("edit mode: unchecking one servicio and checking a different one sends the FULL new set, never an add/remove diff", async () => {
    updateOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="edit"
        clienteId={10}
        oportunidad={existingOportunidad}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));

    // Existing set: consultoria + capacitacion. Uncheck capacitacion, check
    // implementacion. The action MUST receive the complete resulting set
    // (["consultoria", "implementacion"]), not a partial delta object like
    // { add: [...], remove: [...] }.
    await user.click(screen.getByLabelText("Capacitación"));
    await user.click(screen.getByLabelText("Implementación"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateOportunidadActionMock).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({
        serviciosInteres: expect.arrayContaining([
          "consultoria",
          "implementacion",
        ]),
      }),
    );
    const call = updateOportunidadActionMock.mock.calls[0][2];
    expect(call.serviciosInteres).toHaveLength(2);
    expect(call.serviciosInteres).not.toContain("capacitacion");
    // The value passed is a plain array, never a diff/patch object shape.
    expect(Array.isArray(call.serviciosInteres)).toBe(true);
  });

  it("edit mode: unchecking every servicio sends an empty array (set-replace with an empty set is valid)", async () => {
    updateOportunidadActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="edit"
        clienteId={10}
        oportunidad={existingOportunidad}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByLabelText("Consultoría"));
    await user.click(screen.getByLabelText("Capacitación"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const call = updateOportunidadActionMock.mock.calls[0][2];
    expect(call.serviciosInteres).toEqual([]);
  });

  it("surfaces a server error inline instead of throwing or silently failing", async () => {
    createOportunidadActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <OportunidadFormDialog
        mode="create"
        clienteId={10}
        servicioOptions={servicioOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));
    await user.type(screen.getByLabelText("Nombre"), "Nueva oportunidad");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
  });
});
