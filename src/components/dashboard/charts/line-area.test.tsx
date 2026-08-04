import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { LineArea } from "./line-area";

/**
 * PR-1 task 1.7 (RED) — design.md §5 Decision 5 (line/area over time, weekly
 * buckets, 2px line, ≥8px markers, crosshair tooltip, empty state).
 */
describe("LineArea (PR-1, design.md §5)", () => {
  const weeklyData = [
    { label: "Sem. 1", value: 3 },
    { label: "Sem. 2", value: 7 },
    { label: "Sem. 3", value: 5 },
  ];

  it("renders one marker per weekly bucket", () => {
    render(<LineArea data={weeklyData} />);
    expect(screen.getAllByTestId(/^line-area-marker-/)).toHaveLength(3);
  });

  it("renders the line with a 2px stroke width", () => {
    render(<LineArea data={weeklyData} />);
    expect(screen.getByTestId("line-area-line")).toHaveAttribute(
      "stroke-width",
      "2",
    );
  });

  it("renders each week's bucket label", () => {
    render(<LineArea data={weeklyData} />);
    expect(screen.getByText("Sem. 1")).toBeInTheDocument();
    expect(screen.getByText("Sem. 2")).toBeInTheDocument();
    expect(screen.getByText("Sem. 3")).toBeInTheDocument();
  });

  it("shows a crosshair tooltip with the label and value on marker hover", () => {
    render(<LineArea data={weeklyData} />);
    fireEvent.mouseEnter(screen.getByTestId("line-area-marker-Sem. 2"));
    const tooltip = screen.getByTestId("line-area-tooltip");
    expect(tooltip).toHaveTextContent("Sem. 2");
    expect(tooltip).toHaveTextContent("7");
  });

  it("renders an empty state when there is no data", () => {
    render(<LineArea data={[]} />);
    expect(screen.getByText("No hay datos para mostrar.")).toBeInTheDocument();
  });

  it("renders an approximate-data note when a caller-supplied label is given", () => {
    // The actual copy string (e.g. "Aproximado") is a face-specific string
    // owned by the face that uses it (added to es.ts in that face's PR) —
    // this primitive only renders whatever label it is given, never a
    // hardcoded string of its own.
    render(<LineArea data={weeklyData} approximateLabel="Aproximado" />);
    expect(screen.getByTestId("line-area-approximate-note")).toHaveTextContent(
      "Aproximado",
    );
  });

  it("renders no approximate note when no label is given", () => {
    render(<LineArea data={weeklyData} />);
    expect(
      screen.queryByTestId("line-area-approximate-note"),
    ).not.toBeInTheDocument();
  });
});
