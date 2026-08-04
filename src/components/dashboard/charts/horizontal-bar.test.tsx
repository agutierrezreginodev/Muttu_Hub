import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { HorizontalBar } from "./horizontal-bar";

/**
 * PR-1 task 1.5 (RED) — design.md §5 Decision 5/6 (single validated palette,
 * direct labels, legend rule for ≥2 series, 4px rounded mark ends).
 */
describe("HorizontalBar (PR-1, design.md §5)", () => {
  const singleSeries = [
    {
      key: "oportunidades",
      label: "Oportunidades",
      color: "var(--color-rose-500)",
      data: [
        { label: "Abierta", value: 12 },
        { label: "Ganada", value: 5 },
      ],
    },
  ];

  const twoSeries = [
    {
      key: "abiertas",
      label: "Abiertas",
      color: "var(--color-rose-500)",
      data: [
        { label: "María", value: 4 },
        { label: "Juan", value: 2 },
      ],
    },
    {
      key: "vencidas",
      label: "Vencidas",
      color: "var(--color-teal)",
      data: [
        { label: "María", value: 1 },
        { label: "Juan", value: 0 },
      ],
    },
  ];

  it("renders one bar per datum", () => {
    render(<HorizontalBar series={singleSeries} />);
    expect(screen.getAllByTestId(/^horizontal-bar-mark-/)).toHaveLength(2);
  });

  it("renders a direct label with each bar's value", () => {
    render(<HorizontalBar series={singleSeries} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders bars in the given data order", () => {
    render(<HorizontalBar series={singleSeries} />);
    const marks = screen.getAllByTestId(/^horizontal-bar-mark-/);
    expect(marks[0]).toHaveAttribute(
      "data-testid",
      "horizontal-bar-mark-Abierta",
    );
    expect(marks[1]).toHaveAttribute(
      "data-testid",
      "horizontal-bar-mark-Ganada",
    );
  });

  it("renders no legend for a single series", () => {
    render(<HorizontalBar series={singleSeries} />);
    expect(
      screen.queryByTestId("horizontal-bar-legend"),
    ).not.toBeInTheDocument();
  });

  it("renders a legend for two or more series", () => {
    render(<HorizontalBar series={twoSeries} />);
    const legend = screen.getByTestId("horizontal-bar-legend");
    expect(legend).toHaveTextContent("Abiertas");
    expect(legend).toHaveTextContent("Vencidas");
  });

  it("renders 4px rounded ends on every bar mark", () => {
    render(<HorizontalBar series={singleSeries} />);
    for (const mark of screen.getAllByTestId(/^horizontal-bar-mark-/)) {
      expect(mark).toHaveAttribute("rx", "4");
    }
  });

  it("renders an empty state when there is no data", () => {
    render(
      <HorizontalBar
        series={[
          { key: "x", label: "X", color: "var(--color-rose-500)", data: [] },
        ]}
      />,
    );
    expect(screen.getByText("No hay datos para mostrar.")).toBeInTheDocument();
  });

  it("shows a hover tooltip with the label and value", () => {
    render(<HorizontalBar series={singleSeries} />);
    fireEvent.mouseEnter(screen.getByTestId("horizontal-bar-mark-Abierta"));
    expect(screen.getByTestId("horizontal-bar-tooltip")).toHaveTextContent(
      "Abierta",
    );
    expect(screen.getByTestId("horizontal-bar-tooltip")).toHaveTextContent(
      "12",
    );
  });

  /**
   * Regression: value text arrives PRE-FORMATTED, per datum, as a string.
   * It used to arrive as a `formatValue` formatter function, which crashed
   * `/dashboard` at runtime — this component is `"use client"` and every caller
   * is a Server Component, so React rejected the function prop with "Functions
   * cannot be passed directly to Client Components". Unit tests could not see it
   * (they render the client component directly, never crossing the boundary);
   * the E2E suite caught it. These two assertions pin the string contract.
   */
  describe("pre-formatted display values (RSC-safe)", () => {
    const formattedSeries = [
      {
        key: "valor",
        label: "Valor",
        color: "var(--color-rose-500)",
        data: [
          { label: "Abierta", value: 1500000, displayValue: "$ 1.500.000" },
          { label: "Ganada", value: 250000, displayValue: "$ 250.000" },
        ],
      },
    ];

    it("renders each datum's displayValue instead of the raw number", () => {
      render(<HorizontalBar series={formattedSeries} />);
      expect(screen.getByText("$ 1.500.000")).toBeInTheDocument();
      expect(screen.getByText("$ 250.000")).toBeInTheDocument();
      expect(screen.queryByText("1500000")).not.toBeInTheDocument();
    });

    it("uses the displayValue in the hover tooltip too", () => {
      render(<HorizontalBar series={formattedSeries} />);
      fireEvent.mouseEnter(screen.getByTestId("horizontal-bar-mark-Abierta"));
      expect(screen.getByTestId("horizontal-bar-tooltip")).toHaveTextContent(
        "$ 1.500.000",
      );
    });
  });
});
