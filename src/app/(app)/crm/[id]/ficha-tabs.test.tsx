import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/crm/10",
}));

import { FichaTabs } from "./ficha-tabs";

/**
 * Task 8.12, spec FC8 (the single most distinctive requirement of this
 * final PR): after PR8, the ficha MUST render EXACTLY 6 tabs — General,
 * Contactos, Oportunidades, Compromisos, Bitácora, Tareas relacionadas —
 * and there MUST be NO Documentos tab or stub anywhere in the route or
 * DOM (out of scope per the proposal, blocked on repositorio-module). This
 * is asserted directly, not by visual confidence alone.
 */
describe("FichaTabs tab count (task 8.12, spec FC8)", () => {
  it("renders exactly 6 tab links", () => {
    render(<FichaTabs clienteId={10} />);
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("renders exactly the 6 spec FC8 tab labels, in order", () => {
    render(<FichaTabs clienteId={10} />);
    const labels = screen.getAllByRole("link").map((link) => link.textContent);

    expect(labels).toEqual([
      "General",
      "Contactos",
      "Oportunidades",
      "Compromisos",
      "Bitácora",
      "Tareas relacionadas",
    ]);
  });

  it("never renders a Documentos tab or stub anywhere in the DOM", () => {
    render(<FichaTabs clienteId={10} />);
    expect(screen.queryByText(/documentos/i)).not.toBeInTheDocument();
  });

  it("never renders a link to a /documentos route", () => {
    render(<FichaTabs clienteId={10} />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("documentos"))).toBe(false);
  });
});
