import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ActividadFace } from "./actividad-face";

/**
 * Task 3.5 (RED), spec dashboard-actividad. Renders from already-summed
 * props only (server fetch happens in `page.tsx`, task 3.6) — no mocking
 * needed, same convention as `PipelineFace`.
 */
describe("ActividadFace (task 3.5/3.6, spec dashboard-actividad)", () => {
  const baseProps = {
    // Deliberately distinct from every chart direct-label value below
    // (3, 5, 6, 2) so `getByText` can uniquely target each KPI tile,
    // same convention as `PipelineFace`'s own test.
    nuevosContactos: 41,
    nuevasOportunidades: 23,
    feed: [
      {
        id: "bitacora-0",
        typeLabel: "Nota",
        title: "Cliente llamó para consultar",
        subtitle: "Cliente Uno · Ana Coordinadora",
        timestampLabel: "hace 2 horas",
      },
      {
        id: "contacto_nuevo-1",
        typeLabel: "Contacto nuevo",
        title: "Nuevo contacto: Juan Pérez",
        subtitle: "Cliente Dos · —",
        timestampLabel: "hace 1 día",
      },
    ],
    volumenSemanal: [
      { label: "2026-07-20", value: 3 },
      { label: "2026-07-27", value: 5 },
    ],
    clientesActivos: [
      { label: "Cliente Uno", value: 6 },
      { label: "Cliente Dos", value: 2 },
    ],
  };

  it("renders the new-count KPI tiles", () => {
    render(<ActividadFace {...baseProps} />);
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("Nuevos contactos")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Nuevas oportunidades")).toBeInTheDocument();
  });

  it("renders the weekly-volume line chart", () => {
    render(<ActividadFace {...baseProps} />);
    expect(screen.getByText("Actividad por semana")).toBeInTheDocument();
  });

  it("renders the most-active-clientes bar chart", () => {
    render(<ActividadFace {...baseProps} />);
    expect(screen.getByText("Clientes más activos")).toBeInTheDocument();
  });

  it("renders the recent-activity feed with type badge, cliente/actor subtitle, and relative time", () => {
    render(<ActividadFace {...baseProps} />);
    expect(screen.getByText("Actividad reciente")).toBeInTheDocument();
    expect(
      screen.getByText("Cliente llamó para consultar"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cliente Uno · Ana Coordinadora"),
    ).toBeInTheDocument();
    expect(screen.getByText("hace 2 horas")).toBeInTheDocument();
    expect(screen.getByText("Nota")).toBeInTheDocument();
  });

  it("renders empty states for the feed and both charts when there is no visible activity", () => {
    render(
      <ActividadFace
        nuevosContactos={0}
        nuevasOportunidades={0}
        feed={[]}
        volumenSemanal={[]}
        clientesActivos={[]}
      />,
    );
    // LineArea empty + HorizontalBar empty + TimelineList empty.
    expect(screen.getAllByText("No hay datos para mostrar.")).toHaveLength(3);
  });

  it("offers a table-view fallback for the two charts (not for the feed list)", () => {
    render(<ActividadFace {...baseProps} />);
    const toggles = screen.getAllByRole("button", { name: "Ver como tabla" });
    expect(toggles).toHaveLength(2);
  });
});
