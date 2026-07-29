import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BitacoraFeed } from "./bitacora-feed";
import type { BitacoraEntry } from "@/lib/crm/queries";
import type { UsuarioDirectory } from "@/lib/admin/directory";

function makeEntry(overrides: Partial<BitacoraEntry> = {}): BitacoraEntry {
  return {
    id: 1,
    clienteId: 10,
    autorId: "user-1",
    texto: "Llamada de seguimiento",
    createdAt: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function makeDirectory(): UsuarioDirectory {
  const directory: UsuarioDirectory = new Map();
  directory.set("user-1", { nombre: "Ana Gómez", email: "ana@example.com" });
  return directory;
}

/**
 * Task 8.4/8.8, spec BIT1-BIT6: the append-only feed. BIT5 is a HARD
 * requirement — corrections to an entry are new rows, never an edit — so
 * this suite asserts ZERO edit/delete affordance renders anywhere in this
 * tree, for any entry, not merely "happens to not have one" by omission of
 * an assertion. It also asserts rows render in the exact order they are
 * handed (newest-first is `listBitacora`'s own `order(created_at desc)`,
 * matching `bitacora_cliente_idx` — this component never re-sorts).
 */
describe("BitacoraFeed (task 8.4, spec BIT1-BIT6)", () => {
  it("renders the empty state when there are no entries", () => {
    render(<BitacoraFeed rows={[]} directory={makeDirectory()} />);
    expect(
      screen.getByText(
        "Todavía no hay entradas en la bitácora de este cliente.",
      ),
    ).toBeInTheDocument();
  });

  it("renders one item per entry, in the exact order handed (newest-first, per listBitacora's own ordering)", () => {
    const rows = [
      makeEntry({
        id: 2,
        texto: "Entrada más reciente",
        createdAt: "2026-07-02T10:00:00Z",
      }),
      makeEntry({
        id: 1,
        texto: "Entrada más antigua",
        createdAt: "2026-07-01T10:00:00Z",
      }),
    ];
    render(<BitacoraFeed rows={rows} directory={makeDirectory()} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Entrada más reciente");
    expect(items[1]).toHaveTextContent("Entrada más antigua");
  });

  it("resolves autorId to a display name via the directory", () => {
    render(<BitacoraFeed rows={[makeEntry()]} directory={makeDirectory()} />);
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
  });

  it("NEVER renders any edit/delete affordance for any entry (spec BIT5, hard requirement)", () => {
    render(
      <BitacoraFeed
        rows={[makeEntry({ id: 1 }), makeEntry({ id: 2 })]}
        directory={makeDirectory()}
      />,
    );
    // Zero buttons of ANY kind anywhere in this component's tree — the feed
    // is pure read-only rendering, not merely "no button labeled Editar".
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText(/editar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/eliminar/i)).not.toBeInTheDocument();
  });
});
