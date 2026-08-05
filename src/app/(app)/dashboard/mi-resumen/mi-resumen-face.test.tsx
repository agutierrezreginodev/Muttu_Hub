import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MiResumenFace } from "./mi-resumen-face";

/**
 * Mi resumen face (PRD §7.2 "Cara Mi resumen"), the fourth face. Renders from
 * already-summed props only — the server fetch and every pure derivation
 * (`sumMisTareasAbiertas`, `sumMisCompromisos`, `sumMisTareasVencidas`,
 * `sumMisTareasVencenPronto`, `groupMiResumenPorEstado`, all pre-existing and
 * separately unit-tested in `queries.test.ts`) happen in `page.tsx`, same
 * convention as `PipelineFace`/`ActividadFace`/`TareasFace`. No mocking needed.
 */
describe("MiResumenFace (PRD §7.2, fourth dashboard face)", () => {
  const baseProps = {
    // Every headline is a deliberately distinct value so a tile rendering the
    // wrong number cannot pass by coincidence — same convention the other
    // three face tests document.
    abiertas: 11,
    vencidas: 4,
    vencenPronto: 6,
    compromisos: 3,
    misClientes: 8,
    // Includes an estado string absent from tarea's current CHECK constraint
    // (borrador/pendiente/en_curso/cumplido/cancelado) to prove the bar renders
    // whatever the data carries, never a hardcoded list — the same guarantee
    // TareasFace's own test asserts.
    porEstado: [
      { label: "pendiente", value: 7 },
      { label: "estado_inventado", value: 2 },
    ],
    agenda: [
      {
        id: 501,
        titulo: "Enviar propuesta a la Alcaldía",
        fechaLimite: "2026-08-01",
        estado: "pendiente",
        vencido: true,
      },
      {
        id: 502,
        titulo: "Acta de comité",
        fechaLimite: null,
        estado: "en_curso",
        vencido: false,
      },
    ],
  };

  it("renders the five self-scoped headline tiles", () => {
    render(<MiResumenFace {...baseProps} />);

    expect(screen.getByText("Mis tareas abiertas")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("Mis tareas vencidas")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Vencen esta semana")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Mis compromisos de clientes")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Mis clientes asignados")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("flags the overdue tile with the reserved status treatment only when there IS overdue work", () => {
    render(<MiResumenFace {...baseProps} />);
    expect(screen.getByTestId("kpi-tile-status")).toBeInTheDocument();
  });

  it("withholds the overdue status treatment at a genuine zero", () => {
    render(<MiResumenFace {...baseProps} vencidas={0} />);
    // A real zero is not a critical event, so the badge+icon are withheld
    // rather than alarming the viewer over nothing — identical judgment call
    // to TareasFace (design.md §5 Decision 6).
    expect(screen.queryByTestId("kpi-tile-status")).not.toBeInTheDocument();
  });

  it("renders the por-estado bar including a never-hardcoded estado label", () => {
    render(<MiResumenFace {...baseProps} />);
    expect(screen.getByText("Mis tareas por estado")).toBeInTheDocument();
    expect(
      screen.getByTestId("horizontal-bar-mark-estado_inventado"),
    ).toBeInTheDocument();
  });

  it("lists the agenda, marking the overdue row and labelling a missing date", () => {
    render(<MiResumenFace {...baseProps} />);

    expect(screen.getByText("Mis próximas fechas")).toBeInTheDocument();
    expect(
      screen.getByText("Enviar propuesta a la Alcaldía"),
    ).toBeInTheDocument();
    expect(screen.getByText("Acta de comité")).toBeInTheDocument();
    // PRD §5.3: a task with no due date must be visually evident as such, not
    // silently blank.
    expect(screen.getByText("Sin fecha")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });

  it("renders the agenda empty state instead of an error when there is nothing due", () => {
    render(<MiResumenFace {...baseProps} agenda={[]} />);
    expect(
      screen.getByText("No tenés tareas con fecha próxima."),
    ).toBeInTheDocument();
  });

  it("explains on screen what the counts do and do not include", () => {
    render(<MiResumenFace {...baseProps} />);
    // PRD §1.2 "el sistema guía, no interroga": the CRM-only scope of the
    // compromisos tile is stated on screen, not left for the user to infer.
    // Asserted via the testid, not the copy — the phrase "Mis compromisos de
    // clientes" deliberately appears in BOTH the tile label and this help
    // text, so a text query would match two elements and throw.
    expect(screen.getByTestId("mi-resumen-ayuda")).toHaveTextContent(
      /solo los que nacen del CRM/,
    );
  });
});
