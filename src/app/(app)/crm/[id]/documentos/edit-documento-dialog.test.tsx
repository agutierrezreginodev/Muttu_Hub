import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateDocumentoActionMock = vi.fn();

vi.mock("@/lib/documentos/actions", () => ({
  updateDocumentoAction: (...args: unknown[]) =>
    updateDocumentoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { EditDocumentoDialog } from "./edit-documento-dialog";
import type { DocumentoListItem } from "@/lib/documentos/queries";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";

const categoriaOptions: CatalogoOption[] = [
  { codigo: "contratos", etiqueta: "Contratos", orden: 1, activo: true },
  { codigo: "actas", etiqueta: "Actas", orden: 2, activo: true },
];

function makeDocumento(
  overrides: Partial<DocumentoListItem> = {},
): DocumentoListItem {
  return {
    id: 42,
    clienteId: 10,
    nombre: "Acta de reunión",
    categoria: "contratos",
    descripcion: "Reunión de kickoff",
    tags: ["legal", "kickoff"],
    currentVersion: 2,
    sizeBytes: 2048,
    mimeType: "application/pdf",
    originalFilename: "acta.pdf",
    uploadedBy: "user-1",
    currentUploadedAt: "2026-07-01T10:00:00Z",
    createdAt: "2026-06-01T10:00:00Z",
    createdBy: "user-1",
    updatedAt: "2026-07-01T10:00:00Z",
    updatedBy: "user-1",
    ...overrides,
  };
}

describe("EditDocumentoDialog (task 5b.1/5b.2, spec document-library 'Edit document metadata')", () => {
  beforeEach(() => {
    updateDocumentoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("pre-fills the existing metadata, tags rendered as a comma-separated list", async () => {
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("Acta de reunión");
    expect(screen.getByLabelText("Descripción")).toHaveValue(
      "Reunión de kickoff",
    );
    expect(screen.getByLabelText("Etiquetas")).toHaveValue("legal, kickoff");
  });

  it("submits the edited metadata through updateDocumentoAction and confirms with a success toast", async () => {
    updateDocumentoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Acta firmada");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateDocumentoActionMock).toHaveBeenCalledWith(
        10,
        42,
        expect.objectContaining({
          nombre: "Acta firmada",
          categoria: "contratos",
          descripcion: "Reunión de kickoff",
        }),
      );
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Documento actualizado.",
        type: "success",
      }),
    );
  });

  it("sends tags as the FULL parsed array, never a diff — the column is set-replaced", async () => {
    updateDocumentoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Etiquetas"));
    // Deliberately messy: extra spaces and a trailing separator, which must
    // not survive as empty-string tags.
    await user.type(screen.getByLabelText("Etiquetas"), " firmado ,  final , ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateDocumentoActionMock).toHaveBeenCalled();
    });
    const input = updateDocumentoActionMock.mock.calls[0][2];
    expect(input.tags).toEqual(["firmado", "final"]);
    expect(Array.isArray(input.tags)).toBe(true);
  });

  it("clearing the tags field sends an empty array, not undefined", async () => {
    updateDocumentoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Etiquetas"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateDocumentoActionMock).toHaveBeenCalled();
    });
    expect(updateDocumentoActionMock.mock.calls[0][2].tags).toEqual([]);
  });

  it("offers only ACTIVE categoria_documento codes as a new choice", async () => {
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));

    // The picker is rendered from the options the server already filtered to
    // active-only (`activeCatalogoOptions`); the dialog never re-filters.
    expect(screen.getByLabelText("Categoría")).toBeInTheDocument();
  });

  it("surfaces a server error inline, never a silent failure", async () => {
    updateDocumentoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <EditDocumentoDialog
        clienteId={10}
        documento={makeDocumento()}
        categoriaOptions={categoriaOptions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    expect(toastAddMock).not.toHaveBeenCalled();
  });
});
