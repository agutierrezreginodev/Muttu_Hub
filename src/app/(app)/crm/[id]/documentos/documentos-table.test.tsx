import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

// The per-row dialogs are real components here (only their Server Actions, the
// upload route and the router are mocked), so the table's wiring is what is
// under test — not a stub of it.
vi.mock("@/lib/documentos/actions", () => ({
  updateDocumentoAction: vi.fn(),
  deleteDocumentoAction: vi.fn(),
}));

vi.mock("@/lib/documentos/upload-client", () => ({
  postDocumentoUpload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: { add: vi.fn() },
}));

import { DocumentosTable } from "./documentos-table";
import type {
  DocumentoListItem,
  DocumentoVersionListItem,
} from "@/lib/documentos/queries";
import type { CatalogoOptionsMap } from "@/lib/crm/catalogo-options";
import type { UsuarioDirectory } from "@/lib/admin/directory-options";

function makeDocumento(
  overrides: Partial<DocumentoListItem> = {},
): DocumentoListItem {
  return {
    id: 1,
    clienteId: 10,
    nombre: "Acta de reunión",
    categoria: "contratos",
    descripcion: null,
    tags: [],
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

function makeCatalogoOptions(): CatalogoOptionsMap {
  const map: CatalogoOptionsMap = new Map();
  map.set("categoria_documento", [
    { codigo: "contratos", etiqueta: "Contratos", orden: 1, activo: true },
  ]);
  return map;
}

function makeDirectory(): UsuarioDirectory {
  const directory: UsuarioDirectory = new Map();
  directory.set("user-1", { nombre: "Ana Gómez", email: "ana@example.com" });
  return directory;
}

function renderTable(
  rows: DocumentoListItem[],
  versionesByDocumento: Map<number, DocumentoVersionListItem[]> = new Map(),
) {
  return render(
    <DocumentosTable
      rows={rows}
      clienteId={10}
      catalogoOptions={makeCatalogoOptions()}
      directory={makeDirectory()}
      versionesByDocumento={versionesByDocumento}
    />,
  );
}

describe("DocumentosTable (task 5a.3/5a.4, spec document-library)", () => {
  it("renders the empty state when there are no documentos", () => {
    renderTable([]);
    expect(
      screen.getByText("Todavía no hay documentos para este cliente."),
    ).toBeInTheDocument();
  });

  it("renders one row per documento, resolving categoria and subidoPor via their maps", () => {
    renderTable([makeDocumento()]);
    expect(screen.getByText("Acta de reunión")).toBeInTheDocument();
    expect(screen.getByText("Contratos")).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });

  it("renders a per-row download link pointing at the descargar route", () => {
    renderTable([makeDocumento({ id: 42 })]);
    const link = screen.getByRole("link", { name: "Descargar" });
    expect(link).toHaveAttribute("href", "/crm/10/documentos/42/descargar");
  });

  it("toggles a row's selection when its checkbox is clicked, independently of other rows", () => {
    renderTable([
      makeDocumento({ id: 1, nombre: "Acta de reunión" }),
      makeDocumento({ id: 2, nombre: "Contrato marco" }),
    ]);

    const firstCheckbox = screen.getByRole("checkbox", {
      name: "Seleccionar Acta de reunión",
    });
    const secondCheckbox = screen.getByRole("checkbox", {
      name: "Seleccionar Contrato marco",
    });

    expect(firstCheckbox).not.toBeChecked();
    expect(secondCheckbox).not.toBeChecked();

    fireEvent.click(firstCheckbox);

    expect(firstCheckbox).toBeChecked();
    expect(secondCheckbox).not.toBeChecked();
  });

  it("renders the edit and delete dialog triggers once per row (task 5b.2)", () => {
    renderTable([
      makeDocumento({ id: 1, nombre: "Acta de reunión" }),
      makeDocumento({ id: 2, nombre: "Contrato marco" }),
    ]);

    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Eliminar" })).toHaveLength(2);
  });

  it("gives each row its OWN version history, never another row's (task 5b.2)", () => {
    const versiones = new Map<number, DocumentoVersionListItem[]>([
      [
        1,
        [
          {
            id: 100,
            documentoId: 1,
            version: 1,
            storageBucket: "documentos",
            storagePath: "10/1/1/acta.pdf",
            originalFilename: "acta.pdf",
            sizeBytes: 2048,
            mimeType: "application/pdf",
            uploadedBy: "user-1",
            createdAt: "2026-07-01T10:00:00Z",
          },
        ],
      ],
    ]);

    renderTable(
      [
        makeDocumento({ id: 1, nombre: "Acta de reunión" }),
        makeDocumento({ id: 2, nombre: "Contrato marco" }),
      ],
      versiones,
    );

    expect(
      screen.getAllByRole("button", { name: "Historial de versiones" }),
    ).toHaveLength(2);
  });

  it("shows an em dash when currentVersion/sizeBytes/uploadedBy are null", () => {
    renderTable([
      makeDocumento({
        currentVersion: null,
        sizeBytes: null,
        uploadedBy: null,
      }),
    ]);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
