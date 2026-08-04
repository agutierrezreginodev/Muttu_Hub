import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TimelineList } from "./timeline-list";

/**
 * PR-1 task 1.9 (RED) — design.md §5 chart-type mapping (Actividad "recent
 * activity" = timeline list, not a chart: type badge + cliente + actor +
 * relative time).
 */
describe("TimelineList (PR-1, design.md §5)", () => {
  const items = [
    {
      id: "1",
      typeLabel: "Bitácora",
      title: "Llamada de seguimiento",
      subtitle: "Cliente Acme",
      timestampLabel: "hace 2 horas",
    },
    {
      id: "2",
      typeLabel: "Contacto nuevo",
      title: "Juan Pérez",
      subtitle: "Cliente Beta",
      timestampLabel: "hace 1 día",
    },
  ];

  it("renders one entry per item, in the given order", () => {
    render(<TimelineList items={items} />);
    const rendered = screen.getAllByTestId(/^timeline-list-item-/);
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveAttribute("data-testid", "timeline-list-item-1");
    expect(rendered[1]).toHaveAttribute("data-testid", "timeline-list-item-2");
  });

  it("renders the type badge, title, subtitle, and relative time for each entry", () => {
    render(<TimelineList items={items} />);
    expect(screen.getByText("Bitácora")).toBeInTheDocument();
    expect(screen.getByText("Llamada de seguimiento")).toBeInTheDocument();
    expect(screen.getByText("Cliente Acme")).toBeInTheDocument();
    expect(screen.getByText("hace 2 horas")).toBeInTheDocument();
  });

  it("renders an empty state when there are no items", () => {
    render(<TimelineList items={[]} />);
    expect(screen.getByText("No hay datos para mostrar.")).toBeInTheDocument();
  });
});
