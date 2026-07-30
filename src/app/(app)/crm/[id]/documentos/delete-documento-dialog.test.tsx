import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteDocumentoActionMock = vi.fn();

vi.mock("@/lib/documentos/actions", () => ({
  deleteDocumentoAction: (...args: unknown[]) =>
    deleteDocumentoActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DeleteDocumentoDialog } from "./delete-documento-dialog";

describe("DeleteDocumentoDialog (task 5b.1/5b.2, spec document-library 'Soft-delete a document')", () => {
  beforeEach(() => {
    deleteDocumentoActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("soft-deletes through deleteDocumentoAction and confirms with a success toast", async () => {
    deleteDocumentoActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <DeleteDocumentoDialog
        clienteId={10}
        documentoId={42}
        nombre="Acta de reunión"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(deleteDocumentoActionMock).toHaveBeenCalledWith(10, 42);
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Documento eliminado.",
        type: "success",
      }),
    );
  });

  it("names the document being deleted and warns that uploaded bytes are retained", async () => {
    const user = userEvent.setup();

    render(
      <DeleteDocumentoDialog
        clienteId={10}
        documentoId={42}
        nombre="Acta de reunión"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(screen.getByText("¿Eliminar este documento?")).toBeInTheDocument();
    expect(screen.getByText("Acta de reunión")).toBeInTheDocument();
    // Storage retention is deliberate (design Decision: bytes survive a
    // soft-delete) and the copy says so, so the user is not misled into
    // thinking this is a purge.
    expect(
      screen.getByText(
        "Esta acción no se puede deshacer. Los archivos ya subidos se conservan.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a server error inline, never a silent failure", async () => {
    deleteDocumentoActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();

    render(
      <DeleteDocumentoDialog
        clienteId={10}
        documentoId={42}
        nombre="Acta de reunión"
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
