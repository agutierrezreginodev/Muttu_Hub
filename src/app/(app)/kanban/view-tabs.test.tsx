import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KanbanViewTabs } from "./view-tabs";

describe("KanbanViewTabs (spec KV1 — two presentations of one dataset)", () => {
  it("links to both views", () => {
    render(<KanbanViewTabs current="/kanban" params={{}} />);

    expect(screen.getByRole("link", { name: "Tablero" })).toHaveAttribute(
      "href",
      "/kanban",
    );
    expect(screen.getByRole("link", { name: "Lista" })).toHaveAttribute(
      "href",
      "/kanban/lista",
    );
  });

  it("carries the filters and scope across the switch", () => {
    render(
      <KanbanViewTabs
        current="/kanban"
        params={{ scope: "mio", prioridad: "Alta" }}
      />,
    );

    // KV1 is "the same rows, two presentations": losing the filters when
    // switching view would make the two views show different data and turn the
    // switch into a reset button.
    const href = screen
      .getByRole("link", { name: "Lista" })
      .getAttribute("href");
    expect(href).toContain("/kanban/lista?");
    expect(href).toContain("scope=mio");
    expect(href).toContain("prioridad=Alta");
  });

  it("marks the current view for assistive tech", () => {
    render(<KanbanViewTabs current="/kanban/lista" params={{}} />);

    expect(screen.getByRole("link", { name: "Lista" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Tablero" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
