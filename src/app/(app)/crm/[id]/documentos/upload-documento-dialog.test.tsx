import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const postDocumentoUploadMock = vi.fn();
vi.mock("@/lib/documentos/upload-client", () => ({
  postDocumentoUpload: (...args: unknown[]) => postDocumentoUploadMock(...args),
}));

const routerRefreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { UploadDocumentoDialog } from "./upload-documento-dialog";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";

const categoriaOptions: CatalogoOption[] = [
  { codigo: "contratos", etiqueta: "Contratos", orden: 1, activo: true },
  { codigo: "actas", etiqueta: "Actas", orden: 2, activo: true },
];

function makeFile(name = "acta.pdf") {
  return new File(["bytes"], name, { type: "application/pdf" });
}

describe("UploadDocumentoDialog (task 5b.1/5b.2, spec document-library 'Upload a document')", () => {
  beforeEach(() => {
    postDocumentoUploadMock.mockReset();
    routerRefreshMock.mockReset();
    toastAddMock.mockReset();
  });

  async function openDialog() {
    const user = userEvent.setup();
    render(
      <UploadDocumentoDialog
        clienteId={10}
        categoriaOptions={categoriaOptions}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Subir documento" }));
    return user;
  }

  it("uploads the chosen file with its metadata", async () => {
    postDocumentoUploadMock.mockResolvedValue({});
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Archivo"), makeFile());
    await user.type(screen.getByLabelText("Nombre"), "Acta de kickoff");
    await user.type(screen.getByLabelText("Etiquetas"), "legal, acta");
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => {
      expect(postDocumentoUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 10,
          file: expect.any(File),
          metadata: expect.objectContaining({
            nombre: "Acta de kickoff",
            tags: ["legal", "acta"],
          }),
        }),
      );
    });
  });

  it("confirms with a success toast and refreshes so the new row appears", async () => {
    postDocumentoUploadMock.mockResolvedValue({});
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Archivo"), makeFile());
    await user.type(screen.getByLabelText("Nombre"), "Acta de kickoff");
    await user.click(screen.getByRole("button", { name: "Subir" }));

    await waitFor(() => {
      expect(toastAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Documento subido.",
          type: "success",
        }),
      );
    });
    // The route handler revalidates on the server, but a client fetch does not
    // re-render the RSC tree on its own — without this the table would keep
    // showing stale rows until a manual reload.
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("refuses to submit without a file, and never calls the route", async () => {
    const user = await openDialog();

    await user.type(screen.getByLabelText("Nombre"), "Acta de kickoff");
    await user.click(screen.getByRole("button", { name: "Subir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este campo es obligatorio.",
    );
    expect(postDocumentoUploadMock).not.toHaveBeenCalled();
  });

  it("surfaces the route's error inline — a denied category is not a silent failure", async () => {
    postDocumentoUploadMock.mockResolvedValue({
      error: "No tenés acceso a esa categoría.",
    });
    const user = await openDialog();

    await user.upload(screen.getByLabelText("Archivo"), makeFile());
    await user.type(screen.getByLabelText("Nombre"), "Acta de kickoff");
    await user.click(screen.getByRole("button", { name: "Subir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tenés acceso a esa categoría.",
    );
    expect(toastAddMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
