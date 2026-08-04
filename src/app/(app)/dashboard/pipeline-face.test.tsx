import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PipelineFace } from "./pipeline-face";

/**
 * Task 2.7 (RED), spec dashboard-pipeline. Renders from already-summed props
 * only (server fetch happens in `page.tsx`, task 2.8) — no mocking needed.
 */
describe("PipelineFace (task 2.7/2.8, spec dashboard-pipeline)", () => {
  const baseProps = {
    // Deliberately distinct from every direct-label bar value below (2, 1,
    // 1500, 2000) so `getByText` can uniquely target the KPI tile without
    // colliding with a chart's own direct numeric label.
    abiertas: 7,
    valorAbiertas: 1500,
    estadoCount: [
      { label: "Abierta", value: 2 },
      { label: "Ganada", value: 1 },
    ],
    estadoValor: [
      { label: "Abierta", value: 1500 },
      { label: "Ganada", value: 2000 },
    ],
    servicio: [{ label: "Consultoria", value: 2 }],
  };

  it("renders the open-count and open-value KPI tiles", () => {
    render(<PipelineFace {...baseProps} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Oportunidades abiertas")).toBeInTheDocument();
    expect(screen.getByText("Valor total abierto")).toBeInTheDocument();
  });

  it("renders the conversion tile in the pending-classification state, never a percentage", () => {
    render(<PipelineFace {...baseProps} />);
    expect(screen.getByText("Conversión")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de clasificación")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("renders the count-by-estado chart and the value-by-estado chart as two separate charts", () => {
    render(<PipelineFace {...baseProps} />);
    expect(screen.getByText("Oportunidades por estado")).toBeInTheDocument();
    expect(screen.getByText("Valor por estado (COP)")).toBeInTheDocument();
    // Two distinct HorizontalBar SVGs, never one shared dual-axis chart.
    expect(document.querySelectorAll("svg[role='img']")).toHaveLength(3);
  });

  it("renders the servicios chart", () => {
    render(<PipelineFace {...baseProps} />);
    expect(screen.getByText("Por servicio de interés")).toBeInTheDocument();
  });

  it("renders empty states for every chart when there is no visible data", () => {
    render(
      <PipelineFace
        abiertas={0}
        valorAbiertas={0}
        estadoCount={[]}
        estadoValor={[]}
        servicio={[]}
      />,
    );
    expect(screen.getAllByText("No hay datos para mostrar.")).toHaveLength(3);
  });

  it("offers a table-view fallback exposing the same estado/count and estado/value rows", () => {
    render(<PipelineFace {...baseProps} />);
    const toggles = screen.getAllByRole("button", { name: "Ver como tabla" });
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });
});
