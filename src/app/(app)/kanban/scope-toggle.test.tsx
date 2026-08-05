import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BOARD_SCOPES } from "@/lib/kanban/filtros";
import { ScopeToggle } from "./scope-toggle";

describe("ScopeToggle (design D10, spec KV2)", () => {
  it("offers both scopes as links, so each is a fresh server fetch", () => {
    render(
      <ScopeToggle
        scope={BOARD_SCOPES.equipo}
        params={{}}
        basePath="/kanban"
      />,
    );

    // Links, not buttons with client state: "Mi tablero" has to be a QUERY, or
    // it would be a client-side filter hiding rows that already shipped.
    expect(screen.getByRole("link", { name: "Mi tablero" })).toHaveAttribute(
      "href",
      "/kanban?scope=mio",
    );
    expect(
      screen.getByRole("link", { name: "Equipo completo" }),
    ).toHaveAttribute("href", "/kanban?scope=equipo");
  });

  it("marks the active scope for assistive tech, not only visually", () => {
    render(
      <ScopeToggle scope={BOARD_SCOPES.mio} params={{}} basePath="/kanban" />,
    );

    expect(screen.getByRole("link", { name: "Mi tablero" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Equipo completo" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps the other search params when flipping scope", () => {
    render(
      <ScopeToggle
        scope={BOARD_SCOPES.equipo}
        params={{ prioridad: "Alta" }}
        basePath="/kanban"
      />,
    );

    const href = screen
      .getByRole("link", { name: "Mi tablero" })
      .getAttribute("href");
    expect(href).toContain("prioridad=Alta");
    expect(href).toContain("scope=mio");
  });
});
