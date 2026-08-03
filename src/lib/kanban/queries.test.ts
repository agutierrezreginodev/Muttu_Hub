import { describe, expect, it } from "vitest";

import { COMPROMISO_ORIGENES } from "@/lib/crm/queries";
import { TAREA_KANBAN_ORIGENES, isKanbanOrigen } from "@/lib/kanban/queries";

/**
 * Slice 4a (tasks: sdd/kanban-module/tasks). `TAREA_KANBAN_ORIGENES` is the
 * board's own origen filter (KB1: `origen in ('Kanban','Ambos')`), symmetric
 * to `src/lib/crm/queries.ts`'s `COMPROMISO_ORIGENES` (`origen in
 * ('CRM','Ambos')`). Unlike CRM's OWN internal partition
 * (`COMPROMISO_ORIGENES` vs `TAREA_RELACIONADA_ORIGEN`, which stays disjoint
 * because the read-only "Tareas relacionadas" tab deliberately excludes
 * `'Ambos'`), `TAREA_KANBAN_ORIGENES` and `COMPROMISO_ORIGENES` are NOT
 * disjoint from each other — `'Ambos'` belongs to BOTH by design (design
 * D7/KP2): a promoted compromiso must appear on the Kanban board AND stay in
 * the Compromisos tab simultaneously. This suite asserts the two constants
 * together EXHAUSTIVELY cover `tarea.origen`'s CHECK
 * (`'CRM'|'Kanban'|'Ambos'`, supabase/migrations/20260728041924_domain.sql),
 * that `'CRM'`/`'Kanban'` are each exclusive to their own side, and that
 * `'Ambos'` is asserted POSITIVELY as shared by both — so a future agent does
 * not "fix" the overlap into a broken partition.
 */
describe("TAREA_KANBAN_ORIGENES (slice 4a, board origen filter)", () => {
  it("is exactly ('Kanban', 'Ambos')", () => {
    expect(TAREA_KANBAN_ORIGENES).toEqual(["Kanban", "Ambos"]);
  });

  it("classifies 'Kanban' as a Kanban origin", () => {
    expect(isKanbanOrigen("Kanban")).toBe(true);
  });

  it("classifies 'Ambos' as a Kanban origin", () => {
    expect(isKanbanOrigen("Ambos")).toBe(true);
  });

  it("does not classify 'CRM' as a Kanban origin", () => {
    expect(isKanbanOrigen("CRM")).toBe(false);
  });

  it("rejects an unknown origen value (defensive, not part of the DB's own CHECK)", () => {
    expect(isKanbanOrigen("unknown")).toBe(false);
  });
});

describe("origen partition exhaustiveness (TAREA_KANBAN_ORIGENES vs COMPROMISO_ORIGENES)", () => {
  it("together cover every value tarea.origen's CHECK allows", () => {
    for (const origen of ["CRM", "Kanban", "Ambos"]) {
      const coveredByEither =
        isKanbanOrigen(origen) ||
        (COMPROMISO_ORIGENES as readonly string[]).includes(origen);
      expect(coveredByEither).toBe(true);
    }
  });

  it("'CRM' is exclusive to COMPROMISO_ORIGENES, never a Kanban origin", () => {
    expect(isKanbanOrigen("CRM")).toBe(false);
    expect((COMPROMISO_ORIGENES as readonly string[]).includes("CRM")).toBe(
      true,
    );
  });

  it("'Kanban' is exclusive to TAREA_KANBAN_ORIGENES, never a compromiso origen", () => {
    expect(isKanbanOrigen("Kanban")).toBe(true);
    expect(
      (COMPROMISO_ORIGENES as readonly string[]).includes("Kanban"),
    ).toBe(false);
  });

  it("DELIBERATE overlap: 'Ambos' belongs to BOTH sets — a promoted compromiso is simultaneously a board card and a compromiso", () => {
    expect(isKanbanOrigen("Ambos")).toBe(true);
    expect((COMPROMISO_ORIGENES as readonly string[]).includes("Ambos")).toBe(
      true,
    );
  });
});
