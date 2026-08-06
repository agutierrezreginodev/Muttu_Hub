import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BOARD_SCOPES, parseBoardFilters } from "@/lib/kanban/filtros";
import { BoardFilters } from "./board-filters";

const OPTIONS = {
  usuarioOptions: [
    { id: "user-1", nombre: "Ana Torres" },
    { id: "user-2", nombre: "Beto Ruiz" },
  ],
  prioridadOptions: [
    { codigo: "Alta", etiqueta: "Alta" },
    { codigo: "Baja", etiqueta: "Baja" },
  ],
  etiquetaOptions: [{ codigo: "comercial", etiqueta: "Comercial" }],
  clienteOptions: [{ id: 42, nombre: "Grupo Andino" }],
};

function renderFilters(
  params: Record<string, string | undefined> = {},
  basePath = "/kanban",
) {
  return render(
    <BoardFilters
      values={parseBoardFilters(params)}
      params={params}
      basePath={basePath}
      {...OPTIONS}
    />,
  );
}

describe("BoardFilters (spec KV1)", () => {
  it("submits as a GET form to the view it belongs to", () => {
    renderFilters({}, "/kanban/lista");

    // A GET form is the whole mechanism: filtering is a navigation, so the
    // result is server-rendered through RLS, deep-linkable and back-button
    // correct — and it works with no client JS at all. The action must be the
    // CALLER's path or filtering would throw a list-view user onto the board.
    const form = screen.getByRole("form", { name: "Filtros" });
    expect(form).toHaveAttribute("action", "/kanban/lista");
    expect(form).toHaveAttribute("method", "get");
  });

  it("carries the current scope through the form, so filtering does not widen it", () => {
    renderFilters({ scope: "mio" });

    // Scope and filters live in the same URL but are separate controls. Without
    // this hidden field, submitting the filter form would silently drop the
    // user from "Mi tablero" back to the whole team's board.
    const hidden = document.querySelector('input[name="scope"]');
    expect(hidden).toHaveValue(BOARD_SCOPES.mio);
  });

  it("offers one option per catalog and directory entry", () => {
    renderFilters();

    expect(
      screen.getByRole("option", { name: "Ana Torres" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Beto Ruiz" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alta" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Comercial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Grupo Andino" }),
    ).toBeInTheDocument();
  });

  it("shows the filters currently applied, read from the URL", () => {
    renderFilters({
      responsable: "user-2",
      prioridad: "Baja",
      etiqueta: "comercial",
      cliente: "42",
      vencidas: "1",
    });

    // The form is the only display of active filters, so a prefill bug would
    // leave a user unable to tell what they are looking at.
    expect(screen.getByLabelText("Responsable")).toHaveValue("user-2");
    expect(screen.getByLabelText("Prioridad")).toHaveValue("Baja");
    expect(screen.getByLabelText("Etiqueta")).toHaveValue("comercial");
    expect(screen.getByLabelText("Cliente")).toHaveValue("42");
    expect(screen.getByLabelText("Sólo vencidas")).toBeChecked();
    expect(screen.getByLabelText("Sin fecha")).not.toBeChecked();
  });

  it("clears every filter but keeps the scope", () => {
    renderFilters({ scope: "mio", prioridad: "Alta", vencidas: "1" });

    // Clearing filters is not the same intent as leaving "Mi tablero".
    const href = screen
      .getByRole("link", { name: "Limpiar filtros" })
      .getAttribute("href");
    expect(href).toBe("/kanban?scope=mio");
  });

  it("does not offer a clear link when there is nothing to clear", () => {
    renderFilters({ scope: "mio" });

    expect(screen.queryByRole("link", { name: "Limpiar filtros" })).toBeNull();
  });
});
