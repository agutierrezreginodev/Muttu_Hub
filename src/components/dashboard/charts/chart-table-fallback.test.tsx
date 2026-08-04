import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChartTableFallback } from "./chart-table-fallback";

/**
 * PR-1 task 1.9 (RED) — design.md §5 (every chart ships with a table-view
 * fallback with parity to the charted series).
 */
describe("ChartTableFallback (PR-1, design.md §5)", () => {
  const columns = [
    { key: "estado", label: "Estado" },
    { key: "oportunidades", label: "Oportunidades" },
  ];
  const rows = [
    { estado: "Abierta", oportunidades: 12 },
    { estado: "Ganada", oportunidades: 5 },
  ];

  it("renders the chart (children) by default, not the table", () => {
    render(
      <ChartTableFallback columns={columns} rows={rows}>
        <div data-testid="the-chart">chart</div>
      </ChartTableFallback>,
    );
    expect(screen.getByTestId("the-chart")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("toggles to a table with parity rows/columns when the toggle is activated", () => {
    render(
      <ChartTableFallback columns={columns} rows={rows}>
        <div data-testid="the-chart">chart</div>
      </ChartTableFallback>,
    );
    fireEvent.click(screen.getByText("Ver como tabla"));
    expect(screen.queryByTestId("the-chart")).not.toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Estado");
    expect(table).toHaveTextContent("Oportunidades");
    expect(table).toHaveTextContent("Abierta");
    expect(table).toHaveTextContent("12");
    expect(table).toHaveTextContent("Ganada");
    expect(table).toHaveTextContent("5");
  });

  it("toggles back to the chart when activated again", () => {
    render(
      <ChartTableFallback columns={columns} rows={rows}>
        <div data-testid="the-chart">chart</div>
      </ChartTableFallback>,
    );
    fireEvent.click(screen.getByText("Ver como tabla"));
    fireEvent.click(screen.getByText("Ver como gráfico"));
    expect(screen.getByTestId("the-chart")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
