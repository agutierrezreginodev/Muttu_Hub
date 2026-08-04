import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KpiTile } from "./kpi-tile";

/**
 * PR-1 task 1.3 (RED) — design.md §5 Decision 5 (KPI stat tile primitive),
 * §5 Decision 6 (status colors reserved for status meaning only).
 */
describe("KpiTile (PR-1, design.md §5)", () => {
  it("renders the value and label", () => {
    render(<KpiTile label="Oportunidades abiertas" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Oportunidades abiertas")).toBeInTheDocument();
  });

  it("renders a string value verbatim (e.g. a formatted currency amount)", () => {
    render(<KpiTile label="Valor total" value="$ 1.200.000" />);
    expect(screen.getByText("$ 1.200.000")).toBeInTheDocument();
  });

  it("renders a status label when a status is given", () => {
    render(
      <KpiTile
        label="Tareas vencidas"
        value={3}
        status="destructivo"
        statusLabel="Vencidas"
      />,
    );
    expect(screen.getByText("Vencidas")).toBeInTheDocument();
  });

  it("renders an icon alongside the status label when an icon is given (task 4.5/4.6, spec dashboard-tareas: overdue tile 'never color alone')", () => {
    function FakeIcon(props: { className?: string }) {
      return (
        <svg data-testid="kpi-tile-fake-icon" className={props.className} />
      );
    }
    render(
      <KpiTile
        label="Tareas vencidas"
        value={3}
        status="destructivo"
        statusLabel="Vencidas"
        icon={FakeIcon}
      />,
    );
    expect(screen.getByTestId("kpi-tile-fake-icon")).toBeInTheDocument();
  });

  it("renders no status label when status is omitted", () => {
    render(<KpiTile label="Mis clientes" value={12} />);
    expect(screen.queryByTestId("kpi-tile-status")).not.toBeInTheDocument();
  });

  it("renders a loading skeleton instead of the value/label when loading", () => {
    render(<KpiTile label="Oportunidades abiertas" value={42} loading />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Oportunidades abiertas"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("kpi-tile-skeleton")).toBeInTheDocument();
  });
});
