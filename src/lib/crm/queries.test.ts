import { describe, expect, it } from "vitest";

import {
  COMPROMISO_ORIGENES,
  TAREA_RELACIONADA_ORIGEN,
  isCompromisoOrigen,
  isTareaRelacionadaOrigen,
} from "@/lib/crm/queries";

/**
 * Task 8.2/8.8, spec FC9 + design Decision 9: Compromisos and Tareas
 * relacionadas are a pure partition of `v_tarea` by `origen` — no new table,
 * no new view. `listCompromisos`/`listTareasRelacionadas` themselves hit a
 * live Supabase client (not unit-testable without a DB), so this suite
 * pins down the actual filtering PREDICATE each list function uses,
 * asserting the CRM/Ambos vs Kanban partition is correct AND mutually
 * exclusive for every `origen` value `tarea.origen`'s own CHECK constraint
 * allows (`'CRM' | 'Kanban' | 'Ambos'`,
 * supabase/migrations/20260728041924_domain.sql).
 */
describe("Compromiso / Tarea relacionada origen partition (task 8.2, spec FC9)", () => {
  it("COMPROMISO_ORIGENES is exactly ('CRM', 'Ambos')", () => {
    expect(COMPROMISO_ORIGENES).toEqual(["CRM", "Ambos"]);
  });

  it("TAREA_RELACIONADA_ORIGEN is exactly 'Kanban'", () => {
    expect(TAREA_RELACIONADA_ORIGEN).toBe("Kanban");
  });

  it("classifies 'CRM' as a compromiso, never a tarea relacionada", () => {
    expect(isCompromisoOrigen("CRM")).toBe(true);
    expect(isTareaRelacionadaOrigen("CRM")).toBe(false);
  });

  it("classifies 'Ambos' as a compromiso, never a tarea relacionada", () => {
    expect(isCompromisoOrigen("Ambos")).toBe(true);
    expect(isTareaRelacionadaOrigen("Ambos")).toBe(false);
  });

  it("classifies 'Kanban' as a tarea relacionada, never a compromiso", () => {
    expect(isCompromisoOrigen("Kanban")).toBe(false);
    expect(isTareaRelacionadaOrigen("Kanban")).toBe(true);
  });

  it("is mutually exclusive for every origen tarea.origen's CHECK constraint allows", () => {
    for (const origen of ["CRM", "Kanban", "Ambos"]) {
      expect(
        isCompromisoOrigen(origen) && isTareaRelacionadaOrigen(origen),
      ).toBe(false);
    }
  });

  it("rejects an unknown origen value on both sides (defensive, not part of the DB's own CHECK)", () => {
    expect(isCompromisoOrigen("unknown")).toBe(false);
    expect(isTareaRelacionadaOrigen("unknown")).toBe(false);
  });
});
