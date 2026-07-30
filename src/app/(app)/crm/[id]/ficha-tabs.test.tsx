import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/crm/10",
}));

import { FichaTabs } from "./ficha-tabs";

/**
 * Task 5a.1, spec document-library "Documentos ficha tab (7th tab)": this
 * SUPERSEDES the prior FC8 discipline (exactly 6 tabs, no Documentos). After
 * `documentos-repositorio` PR5a, the ficha renders exactly **7** tabs,
 * ending with Documentos, and its link points to a route that exists
 * (`crm/[id]/documentos/page.tsx`, shipped in this same slice).
 */
describe("FichaTabs tab count (task 5a.1, spec document-library FC8 reversal)", () => {
  it("renders exactly 7 tab links", () => {
    render(<FichaTabs clienteId={10} />);
    expect(screen.getAllByRole("link")).toHaveLength(7);
  });

  it("renders exactly the 7 tab labels, in order, ending with Documentos", () => {
    render(<FichaTabs clienteId={10} />);
    const labels = screen.getAllByRole("link").map((link) => link.textContent);

    expect(labels).toEqual([
      "General",
      "Contactos",
      "Oportunidades",
      "Compromisos",
      "Bitácora",
      "Tareas relacionadas",
      "Documentos",
    ]);
  });

  it("renders a Documentos tab whose link points to an existing /crm/{id}/documentos route", () => {
    render(<FichaTabs clienteId={10} />);
    const documentosLink = screen.getByRole("link", { name: "Documentos" });
    expect(documentosLink).toBeInTheDocument();
    expect(documentosLink).toHaveAttribute("href", "/crm/10/documentos");
  });
});
