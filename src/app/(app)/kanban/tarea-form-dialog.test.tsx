import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createTareaActionMock = vi.fn();
const updateTareaActionMock = vi.fn();

vi.mock("@/lib/kanban/actions", () => ({
  createTareaAction: (...args: unknown[]) => createTareaActionMock(...args),
  updateTareaAction: (...args: unknown[]) => updateTareaActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { TareaFormDialog } from "./tarea-form-dialog";

const USUARIO_OPTIONS = [
  { id: "user-1", nombre: "Ana Torres" },
  { id: "user-2", nombre: "Beto Ruiz" },
];

const ETIQUETA_OPTIONS = [
  { codigo: "comercial", etiqueta: "Comercial" },
  { codigo: "interno", etiqueta: "Interno" },
];

const PRIORIDAD_OPTIONS = [
  { codigo: "Alta", etiqueta: "Alta" },
  { codigo: "Media", etiqueta: "Media" },
];

function renderCreate() {
  return render(
    <TareaFormDialog
      mode="create"
      usuarioOptions={USUARIO_OPTIONS}
      etiquetaOptions={ETIQUETA_OPTIONS}
      prioridadOptions={PRIORIDAD_OPTIONS}
      defaultResponsableId="user-1"
    />,
  );
}

const EXISTING_TAREA = {
  id: 42,
  titulo: "Revisar contrato marco",
  descripcion: "Verificar las cláusulas de SLA.",
  responsableId: "user-2",
  clienteId: 7,
  // Comes off `v_tarea.fecha_limite`, a timestamptz — NOT a date string.
  fechaLimite: "2026-09-01T00:00:00+00:00",
  prioridad: "Alta",
  etiquetas: ["comercial"],
};

function renderEdit() {
  return render(
    <TareaFormDialog
      mode="edit"
      tarea={EXISTING_TAREA}
      usuarioOptions={USUARIO_OPTIONS}
      etiquetaOptions={ETIQUETA_OPTIONS}
      prioridadOptions={PRIORIDAD_OPTIONS}
      defaultResponsableId="user-1"
    />,
  );
}

describe("TareaFormDialog (slice 5a, spec KT1/KT2)", () => {
  beforeEach(() => {
    createTareaActionMock.mockReset();
    updateTareaActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("creates with the current user as responsable, without asking for one", async () => {
    createTareaActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(screen.getByLabelText("Título"), "Preparar acta");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // Spec KT1 / PRD §5.3: a Kanban tarea can never be ownerless, and the form
    // defaults rather than interrogating — so a create with only a título must
    // still arrive carrying a responsable.
    await waitFor(() => {
      expect(createTareaActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: "Preparar acta",
          responsableId: "user-1",
        }),
      );
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarea creada.", type: "success" }),
    );
  });

  it("submits the complete etiqueta set, never a diff", async () => {
    createTareaActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(screen.getByLabelText("Título"), "Preparar acta");
    await user.click(screen.getByLabelText("Comercial"));
    await user.click(screen.getByLabelText("Interno"));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createTareaActionMock).toHaveBeenCalledWith(
        expect.objectContaining({ etiquetas: ["comercial", "interno"] }),
      );
    });
  });

  it("unchecking an etiqueta removes it from the submitted set", async () => {
    createTareaActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(screen.getByLabelText("Título"), "Preparar acta");
    await user.click(screen.getByLabelText("Comercial"));
    await user.click(screen.getByLabelText("Comercial"));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createTareaActionMock).toHaveBeenCalledWith(
        expect.objectContaining({ etiquetas: [] }),
      );
    });
  });

  it("prefills every editable field from the existing tarea", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Título")).toHaveValue(
      "Revisar contrato marco",
    );
    expect(screen.getByLabelText("Descripción")).toHaveValue(
      "Verificar las cláusulas de SLA.",
    );
    expect(screen.getByLabelText("Comercial")).toBeChecked();
    expect(screen.getByLabelText("Interno")).not.toBeChecked();
  });

  it("prefills fecha límite as a date the input can actually hold", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Editar" }));

    // `v_tarea.fecha_limite` is a timestamptz. A `<input type="date">` silently
    // renders an empty value for anything that is not YYYY-MM-DD, and an empty
    // date field submits as "clear this field" — so a raw timestamptz prefill
    // would wipe the deadline of every tarea anyone ever edits.
    expect(screen.getByLabelText("Fecha límite")).toHaveValue("2026-09-01");
  });

  it("updates the existing row by id and keeps its cliente", async () => {
    updateTareaActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Revisar contrato v2");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateTareaActionMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          titulo: "Revisar contrato v2",
          responsableId: "user-2",
          // Not shown in the form, but omitting it would silently detach the
          // tarea from its cliente on every edit.
          clienteId: 7,
        }),
      );
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tarea actualizada.", type: "success" }),
    );
  });

  it("surfaces a server error inline and shows no success toast", async () => {
    createTareaActionMock.mockResolvedValue({
      error: "Esa etiqueta ya no está activa.",
    });
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(screen.getByLabelText("Título"), "Preparar acta");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa etiqueta ya no está activa.",
    );
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
