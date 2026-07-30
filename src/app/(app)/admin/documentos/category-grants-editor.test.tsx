import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const grantCategoryActionMock = vi.fn();
const revokeCategoryActionMock = vi.fn();

vi.mock("@/lib/admin/category-grants-actions", () => ({
  grantCategoryAction: (...args: unknown[]) => grantCategoryActionMock(...args),
  revokeCategoryAction: (...args: unknown[]) =>
    revokeCategoryActionMock(...args),
}));

const toastAddMock = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  toast: { add: (...args: unknown[]) => toastAddMock(...args) },
}));

import { CategoryGrantsEditor } from "./category-grants-editor";
import type { RolOption } from "@/lib/admin/directory-options";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";

const roles: RolOption[] = [
  { id: 1, nombre: "Coordinador", activo: true },
  { id: 2, nombre: "Colaborador", activo: true },
];

const categorias: CatalogoOption[] = [
  { codigo: "contratos", etiqueta: "Contratos", orden: 1, activo: true },
  { codigo: "actas", etiqueta: "Actas", orden: 2, activo: true },
];

function renderEditor({
  grants = new Map<number, Set<string>>(),
  rolesOverride = roles,
  categoriasOverride = categorias,
}: {
  grants?: Map<number, Set<string>>;
  rolesOverride?: RolOption[];
  categoriasOverride?: CatalogoOption[];
} = {}) {
  return render(
    <CategoryGrantsEditor
      roles={rolesOverride}
      categorias={categoriasOverride}
      grants={grants}
    />,
  );
}

describe("CategoryGrantsEditor (task 7.1/7.2, spec document-permissions)", () => {
  beforeEach(() => {
    grantCategoryActionMock.mockReset();
    revokeCategoryActionMock.mockReset();
    toastAddMock.mockReset();
  });

  it("renders one row per role and one checkbox per category", () => {
    renderEditor();

    expect(screen.getByText("Coordinador")).toBeInTheDocument();
    expect(screen.getByText("Colaborador")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("checks only the cells that are actually granted", () => {
    renderEditor({ grants: new Map([[1, new Set(["contratos"])]]) });

    expect(
      screen.getByRole("checkbox", { name: "Coordinador — Contratos" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Coordinador — Actas" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Colaborador — Contratos" }),
    ).not.toBeChecked();
  });

  it("grants a category when an unchecked cell is ticked", async () => {
    grantCategoryActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("checkbox", { name: "Colaborador — Actas" }),
    );

    await waitFor(() => {
      expect(grantCategoryActionMock).toHaveBeenCalledWith(2, "actas");
    });
    expect(revokeCategoryActionMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" }),
    );
  });

  it("revokes a category when a checked cell is unticked", async () => {
    revokeCategoryActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderEditor({ grants: new Map([[1, new Set(["contratos"])]]) });

    await user.click(
      screen.getByRole("checkbox", { name: "Coordinador — Contratos" }),
    );

    await waitFor(() => {
      expect(revokeCategoryActionMock).toHaveBeenCalledWith(1, "contratos");
    });
    expect(grantCategoryActionMock).not.toHaveBeenCalled();
  });

  it("reflects the change immediately, before the server round trip settles", async () => {
    let resolveAction: (value: { success: boolean }) => void = () => {};
    grantCategoryActionMock.mockReturnValue(
      new Promise<{ success: boolean }>((resolve) => {
        resolveAction = resolve;
      }),
    );
    const user = userEvent.setup();
    renderEditor();

    const cell = screen.getByRole("checkbox", {
      name: "Colaborador — Actas",
    });
    await user.click(cell);

    expect(cell).toBeChecked();
    resolveAction({ success: true });
  });

  it("reverts the cell and shows the error when the server rejects the change", async () => {
    grantCategoryActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();
    renderEditor();

    const cell = screen.getByRole("checkbox", { name: "Colaborador — Actas" });
    await user.click(cell);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    // A failed grant must not leave the grid claiming a permission that was
    // never written — the next admin to read this screen would be misled.
    expect(cell).not.toBeChecked();
    expect(toastAddMock).not.toHaveBeenCalled();
  });

  it("tells the admin to seed the catalog instead of rendering an empty grid", () => {
    renderEditor({ categoriasOverride: [] });

    expect(
      screen.getByText(
        "Primero creá códigos de catálogo del tipo categoria_documento.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("marks an inactive role, whose grants still take effect", () => {
    renderEditor({
      rolesOverride: [{ id: 3, nombre: "Auditor", activo: false }],
    });

    // categoria_visible does NOT gate on rol.activo (design Decision 4), so an
    // inactive role's grants are still live and must not look absent here.
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText(/Inactivo/)).toBeInTheDocument();
    expect(within(row).getAllByRole("checkbox")).toHaveLength(2);
  });
});
