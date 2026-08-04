import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TareasFace } from "./tareas-face";

/**
 * Task 4.5 (RED), spec dashboard-tareas. Renders from already-summed props
 * only (server fetch happens in `page.tsx`, task 4.6) — no mocking needed,
 * same convention as `PipelineFace`/`ActividadFace`.
 */
describe("TareasFace (task 4.5/4.6, spec dashboard-tareas)", () => {
  const baseProps = {
    // Deliberately distinct from every chart direct-label value below, same
    // "deliberately distinct" convention PipelineFace/ActividadFace's own
    // tests document.
    vencidasTotal: 17,
    // Includes an estado string that does NOT exist in tarea's current
    // check constraint (borrador/pendiente/en_curso/cumplido/cancelado) —
    // proves the estado bar renders whatever the data carries, never a
    // hardcoded list (spec: "estado values MUST be read from the data, not
    // hardcoded, so a Kanban change to the state set does not silently drop
    // a bar").
    estadoPorEstado: [
      { label: "pendiente", value: 4 },
      { label: "en_revision_futura", value: 2 },
    ],
    throughputSemanal: [
      { label: "2026-07-20", value: 3 },
      { label: "2026-07-27", value: 5 },
    ],
    responsablePorResponsable: [
      { label: "Ana Coordinadora", abiertas: 6, vencidas: 2 },
      { label: "Otros", abiertas: 3, vencidas: 1 },
    ],
  };

  it("renders the overdue KPI tile with the reserved status color and an icon", () => {
    render(<TareasFace {...baseProps} />);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("Tareas vencidas")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tile-status")).toBeInTheDocument();
  });

  it("renders the count-por-estado bar chart, including a never-hardcoded estado label", () => {
    render(<TareasFace {...baseProps} />);
    expect(screen.getByText("Tareas por estado")).toBeInTheDocument();
    // A bar mark exists for the invented estado string above — proves the
    // chart renders whatever estado label the data carries, never a
    // hardcoded/mapped list.
    expect(
      screen.getByTestId("horizontal-bar-mark-en_revision_futura"),
    ).toBeInTheDocument();
  });

  it("renders the throughput line chart labeled aproximado", () => {
    render(<TareasFace {...baseProps} />);
    expect(
      screen.getByText("Tareas completadas por semana"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("line-area-approximate-note"),
    ).toBeInTheDocument();
  });

  it("renders the por-responsable bar chart with overdue distinguishable via the legend", () => {
    render(<TareasFace {...baseProps} />);
    expect(
      screen.getByText("Tareas abiertas por responsable"),
    ).toBeInTheDocument();
    const legend = screen.getByTestId("horizontal-bar-legend");
    expect(legend).toHaveTextContent("Abiertas");
    expect(legend).toHaveTextContent("Vencidas");
  });

  it("renders empty states for every chart when there are no visible tareas", () => {
    render(
      <TareasFace
        vencidasTotal={0}
        estadoPorEstado={[]}
        throughputSemanal={[]}
        responsablePorResponsable={[]}
      />,
    );
    // HorizontalBar empty (estado) + LineArea empty (throughput) +
    // HorizontalBar empty (responsable) = 3.
    expect(screen.getAllByText("No hay datos para mostrar.")).toHaveLength(3);
    expect(screen.queryByTestId("kpi-tile-status")).not.toBeInTheDocument();
  });

  it("offers a table-view fallback for all three charts", () => {
    render(<TareasFace {...baseProps} />);
    const toggles = screen.getAllByRole("button", { name: "Ver como tabla" });
    expect(toggles).toHaveLength(3);
  });
});
