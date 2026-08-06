import { describe, expect, it } from "vitest";

import { hrefFor } from "@/lib/notificaciones/href";

describe("hrefFor (slice 10, NB4/N5)", () => {
  it("sends a CRM compromiso to its client's Compromisos tab", () => {
    expect(hrefFor({ id: 7, origen: "CRM", clienteId: 42 })).toBe(
      "/crm/42/compromisos",
    );
  });

  it("sends a promoted compromiso to CRM too, not to the board", () => {
    // 'Ambos' exists in both places; the CRM side is the one that explains
    // why the task exists at all.
    expect(hrefFor({ id: 7, origen: "Ambos", clienteId: 42 })).toBe(
      "/crm/42/compromisos",
    );
  });

  it("sends a board-only tarea to its detail route", () => {
    expect(hrefFor({ id: 7, origen: "Kanban", clienteId: null })).toBe(
      "/kanban/7",
    );
  });

  it("falls back to the detail route for a CRM row with no cliente to land on", () => {
    // There is no /crm/null/compromisos to send anyone to.
    expect(hrefFor({ id: 7, origen: "CRM", clienteId: null })).toBe(
      "/kanban/7",
    );
    expect(hrefFor({ id: 7, origen: "Ambos", clienteId: null })).toBe(
      "/kanban/7",
    );
  });

  it("sends a Kanban row that somehow carries a cliente to the board anyway", () => {
    // Kanban-origen is never CRM's to claim, cliente or not.
    expect(hrefFor({ id: 7, origen: "Kanban", clienteId: 42 })).toBe(
      "/kanban/7",
    );
  });
});
