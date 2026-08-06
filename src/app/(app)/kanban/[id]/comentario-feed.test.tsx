import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { UsuarioDirectory } from "@/lib/admin/directory-options";
import { ComentarioFeed } from "./comentario-feed";
import type { ComentarioEntry } from "@/lib/kanban/queries";

const DIRECTORY: UsuarioDirectory = new Map([
  ["user-1", { nombre: "Ana Torres", email: "ana@muttu-hub.test" }],
]);

function makeEntry(overrides: Partial<ComentarioEntry> = {}): ComentarioEntry {
  return {
    id: 1,
    autorId: "user-1",
    texto: "Confirmé el alcance con el cliente.",
    createdAt: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

describe("ComentarioFeed (spec KM1/KM2, design D8)", () => {
  it("renders each comment with its author", () => {
    render(
      <ComentarioFeed
        rows={[
          makeEntry({ id: 1, texto: "Primero" }),
          makeEntry({ id: 2, texto: "Segundo" }),
        ]}
        directory={DIRECTORY}
      />,
    );

    expect(screen.getByText("Primero")).toBeInTheDocument();
    expect(screen.getByText("Segundo")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Torres")).toHaveLength(2);
  });

  it("offers NO edit or delete control, whatever the viewer's permissions", () => {
    render(<ComentarioFeed rows={[makeEntry()]} directory={DIRECTORY} />);

    // KM2's immutability is enforced at the GRANT layer: `tarea_comentario` has
    // no UPDATE or DELETE grant for any role, not even an administrador. A
    // control here would be a button that can only ever fail, so this component
    // has zero interactive elements by design — the same rule `bitacora-feed`
    // follows.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the order it was given, newest first, without re-sorting", () => {
    render(
      <ComentarioFeed
        rows={[
          makeEntry({
            id: 2,
            texto: "Más nuevo",
            createdAt: "2026-08-05T12:00:00Z",
          }),
          makeEntry({
            id: 1,
            texto: "Más viejo",
            createdAt: "2026-08-01T12:00:00Z",
          }),
        ]}
        directory={DIRECTORY}
      />,
    );

    // Rows arrive pre-sorted from the query, matching
    // `tarea_comentario_idx (tarea_id, created_at desc)`.
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Más nuevo");
    expect(items[1]).toHaveTextContent("Más viejo");
  });

  it("resolves an unknown author to a dash instead of leaking a raw uuid", () => {
    render(
      <ComentarioFeed
        rows={[makeEntry({ autorId: "user-desconocido" })]}
        directory={DIRECTORY}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("user-desconocido")).toBeNull();
  });

  it("says the thread is empty rather than rendering nothing", () => {
    render(<ComentarioFeed rows={[]} directory={DIRECTORY} />);
    expect(screen.getByText("Todavía no hay comentarios.")).toBeInTheDocument();
  });
});
