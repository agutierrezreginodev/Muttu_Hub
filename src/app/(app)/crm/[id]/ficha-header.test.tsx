import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FichaHeader } from "./ficha-header";

/**
 * Task 6.14, spec FC7: the header marks the próximo compromiso visually
 * distinct (red) ONLY when v_tarea.vencido is true — read straight from the
 * view, never recomputed/derived client-side. This test never computes
 * "vencido" itself; it only asserts the component's rendering reacts to the
 * boolean it is handed, matching FC7 literally.
 */
describe("FichaHeader vencido styling (task 6.14, spec FC7)", () => {
  it("renders the cliente nombre", () => {
    render(<FichaHeader clienteNombre="Acme Corp" proximoCompromiso={null} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows the empty state when there is no próximo compromiso", () => {
    render(<FichaHeader clienteNombre="Acme Corp" proximoCompromiso={null} />);
    expect(screen.getByText("Sin compromisos pendientes.")).toBeInTheDocument();
  });

  it("renders the compromiso WITHOUT destructive styling when vencido is false", () => {
    render(
      <FichaHeader
        clienteNombre="Acme Corp"
        proximoCompromiso={{
          id: 1,
          titulo: "Llamada de seguimiento",
          fechaLimite: "2026-08-01T00:00:00Z",
          estado: "pendiente",
          vencido: false,
        }}
      />,
    );
    const badge = screen.getByTestId("proximo-compromiso-badge");
    // Badge's base classes always carry aria-invalid:*-destructive utilities
    // regardless of variant — assert on the variant-specific background
    // class instead of a broad "destructive" substring match.
    expect(badge.className).not.toMatch(/bg-destructive/);
  });

  it("renders the compromiso WITH destructive (red) styling when v_tarea.vencido is true", () => {
    render(
      <FichaHeader
        clienteNombre="Acme Corp"
        proximoCompromiso={{
          id: 2,
          titulo: "Renovación de contrato",
          fechaLimite: "2020-01-01T00:00:00Z",
          estado: "pendiente",
          vencido: true,
        }}
      />,
    );
    const badge = screen.getByTestId("proximo-compromiso-badge");
    expect(badge.className).toMatch(/bg-destructive/);
    expect(screen.getByText("Renovación de contrato")).toBeInTheDocument();
  });
});
