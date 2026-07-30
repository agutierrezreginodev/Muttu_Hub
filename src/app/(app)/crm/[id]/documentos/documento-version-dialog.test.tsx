import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const postDocumentoUploadMock = vi.fn();
vi.mock("@/lib/documentos/upload-client", () => ({
  postDocumentoUpload: (...args: unknown[]) =>
    postDocumentoUploadMock(...args),
}));

const routerRefreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { DocumentoVersionDialog } from "./documento-version-dialog";
import type { DocumentoVersionListItem } from "@/lib/documentos/queries";
import type { UsuarioDirectory } from "@/lib/admin/directory-options";

function makeVersion(
  overrides: Partial<DocumentoVersionListItem> = {},
): DocumentoVersionListItem {
  return {
    id: 10,
    documentoId: 42,
    version: 1,
    storageBucket: "documentos",
    storagePath: "10/42/1/acta.pdf",
    originalFilename: "acta.pdf",
    sizeBytes: 2048,
    mimeType: "application/pdf",
    uploadedBy: "user-1",
    createdAt: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function makeDirectory(): UsuarioDirectory {
  const directory: UsuarioDirectory = new Map();
  directory.set("user-1", { nombre: "Ana Gómez", email: "ana@example.com" });
  return directory;
}

function renderDialog(versiones: DocumentoVersionListItem[]) {
  return render(
    <DocumentoVersionDialog
      clienteId={10}
      documentoId={42}
      nombre="Acta de reunión"
      versiones={versiones}
      directory={makeDirectory()}
    />,
  );
}

describe("DocumentoVersionDialog (task 5b.1/5b.2, spec document-versioning 'Version history is retained and viewable')", () => {
  beforeEach(() => {
    postDocumentoUploadMock.mockReset();
    routerRefreshMock.mockReset();
    toastAddMock.mockReset();
  });

  it("lists every version in the order received (newest-first from the query)", async () => {
    const user = userEvent.setup();
    renderDialog([
      makeVersion({ id: 12, version: 3, originalFilename: "acta-v3.pdf" }),
      makeVersion({ id: 11, version: 2, originalFilename: "acta-v2.pdf" }),
      makeVersion({ id: 10, version: 1, originalFilename: "acta.pdf" }),
    ]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );

    expect(screen.getByText("acta-v3.pdf")).toBeInTheDocument();
    expect(screen.getByText("acta-v2.pdf")).toBeInTheDocument();
    expect(screen.getByText("acta.pdf")).toBeInTheDocument();

    // The dialog must NOT re-sort: `listVersionesByCliente` already ordered
    // version desc at the database.
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("acta-v3.pdf")).toBeInTheDocument();
    expect(within(rows[2]).getByText("acta.pdf")).toBeInTheDocument();
  });

  it("shows each version's own physical attributes and uploader", async () => {
    const user = userEvent.setup();
    renderDialog([makeVersion({ version: 2, sizeBytes: 2048 })]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );

    const row = screen.getAllByRole("listitem")[0];
    expect(within(row).getByText(/2 KB/)).toBeInTheDocument();
    expect(within(row).getByText("Ana Gómez")).toBeInTheDocument();
  });

  it("links each historic version to its OWN version, never to the current one", async () => {
    const user = userEvent.setup();
    renderDialog([
      makeVersion({ id: 11, version: 2 }),
      makeVersion({ id: 10, version: 1 }),
    ]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );

    const links = screen.getAllByRole("link", { name: "Descargar" });
    expect(links[0]).toHaveAttribute(
      "href",
      "/crm/10/documentos/42/descargar?version=2",
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "/crm/10/documentos/42/descargar?version=1",
    );
  });

  it("renders the empty state when a document somehow has no visible versions", async () => {
    const user = userEvent.setup();
    renderDialog([]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );

    expect(
      screen.getByText("Todavía no hay versiones para este documento."),
    ).toBeInTheDocument();
  });

  it("uploads a new version with documentoId and NO metadata, then refreshes", async () => {
    postDocumentoUploadMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderDialog([makeVersion()]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );
    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["bytes"], "acta-v2.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Subir nueva versión" }),
    );

    await waitFor(() => {
      expect(postDocumentoUploadMock).toHaveBeenCalledWith({
        clienteId: 10,
        documentoId: 42,
        file: expect.any(File),
      });
    });
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Nueva versión subida.",
        type: "success",
      }),
    );
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("refuses to upload a version without a file", async () => {
    const user = userEvent.setup();
    renderDialog([makeVersion()]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Subir nueva versión" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este campo es obligatorio.",
    );
    expect(postDocumentoUploadMock).not.toHaveBeenCalled();
  });

  it("surfaces the route's error inline", async () => {
    postDocumentoUploadMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();
    renderDialog([makeVersion()]);

    await user.click(
      screen.getByRole("button", { name: "Historial de versiones" }),
    );
    await user.upload(
      screen.getByLabelText("Archivo"),
      new File(["bytes"], "acta-v2.pdf", { type: "application/pdf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Subir nueva versión" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
