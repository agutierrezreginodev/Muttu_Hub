import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DistribucionCard } from "./distribucion-card";

describe("DistribucionCard (slice 8)", () => {
  it("renders each bucket with its label and count", () => {
    render(
      <DistribucionCard
        titulo="Por estado"
        items={[
          { clave: "en_curso", etiqueta: "En curso", total: 4 },
          { clave: "pendiente", etiqueta: "Pendiente", total: 1 },
        ]}
      />,
    );

    expect(screen.getByText("Por estado")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows the empty state instead of an empty list", () => {
    render(<DistribucionCard titulo="Por etiqueta" items={[]} />);

    expect(screen.getByText("No hay tareas para reportar.")).toBeInTheDocument();
  });

  it("renders the optional help text when given one", () => {
    render(
      <DistribucionCard
        titulo="Por etiqueta"
        items={[{ clave: "comercial", etiqueta: "Comercial", total: 2 }]}
        ayuda="Una tarea con varias etiquetas cuenta en cada una."
      />,
    );

    expect(
      screen.getByText("Una tarea con varias etiquetas cuenta en cada una."),
    ).toBeInTheDocument();
  });

  it("carries no export or download control (KR2)", () => {
    render(
      <DistribucionCard
        titulo="Por estado"
        items={[{ clave: "en_curso", etiqueta: "En curso", total: 4 }]}
      />,
    );

    // `kanban.exportar` stays seeded but unenforced in v1, and the reports are
    // on-screen only. An export affordance here would promise a capability the
    // permission model does not yet gate.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("exposes the distribution as a list, not as free-floating text", () => {
    render(
      <DistribucionCard
        titulo="Por estado"
        items={[
          { clave: "en_curso", etiqueta: "En curso", total: 4 },
          { clave: "pendiente", etiqueta: "Pendiente", total: 1 },
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
