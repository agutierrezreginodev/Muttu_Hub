import { describe, expect, it } from "vitest";

import {
  ETIQUETA_TIPO,
  COLUMNA_TIPO,
  TERMINAL_COLUMNA_ESTADO,
  fallbackColumna,
  groupTareasByColumna,
  isTerminalColumna,
  sortTareasForBoard,
} from "@/lib/kanban/columnas";

/**
 * Slice 4a (tasks: sdd/kanban-module/tasks, design part 1 §6). Only
 * `fallbackColumna` and `groupTareasByColumna` are exercised at this slice —
 * `resolveEstadoOnMove`'s truth table (design's 9 rows) is scaffolded in a
 * later slice (5b), once `moveTareaAction` exists to consume it.
 */
describe("COLUMNA_TIPO / ETIQUETA_TIPO constants", () => {
  it("are the exact catalogo tipo strings the migration seeded", () => {
    expect(COLUMNA_TIPO).toBe("columna_tablero");
    expect(ETIQUETA_TIPO).toBe("etiqueta_tarea");
  });
});

describe("isTerminalColumna (design D1/D5 — reserved terminal codes)", () => {
  it("is true for 'cumplido'", () => {
    expect(isTerminalColumna("cumplido")).toBe(true);
  });

  it("is true for 'cancelado'", () => {
    expect(isTerminalColumna("cancelado")).toBe(true);
  });

  it("is false for a non-terminal seeded code", () => {
    expect(isTerminalColumna("por_hacer")).toBe(false);
  });

  it("is false for an admin-created column code — admin codes never touch estado", () => {
    expect(isTerminalColumna("bloqueado")).toBe(false);
  });

  it("is false for null", () => {
    expect(isTerminalColumna(null)).toBe(false);
  });

  it("TERMINAL_COLUMNA_ESTADO maps each terminal code to the identically-named estado", () => {
    expect(TERMINAL_COLUMNA_ESTADO.cumplido).toBe("cumplido");
    expect(TERMINAL_COLUMNA_ESTADO.cancelado).toBe("cancelado");
  });
});

describe("fallbackColumna (spec KC3/design D3 — null columna renders in the lowest-orden active column)", () => {
  it("returns the first active column's codigo", () => {
    const activas = [
      { codigo: "por_hacer" },
      { codigo: "en_curso" },
      { codigo: "en_revision" },
    ];
    expect(fallbackColumna(activas)).toBe("por_hacer");
  });

  it("returns null when there are no active columns at all", () => {
    expect(fallbackColumna([])).toBeNull();
  });

  it("resolves to whatever is now first after the admin deactivates the original first column", () => {
    // Simulates an admin deactivating 'por_hacer': v_catalogo (active-only)
    // no longer includes it, so the caller's own active-columns array
    // reflects the new state — fallbackColumna re-resolves rather than
    // dangling on a hardcoded default (design D3's stated rationale).
    const activasAfterDeactivation = [
      { codigo: "en_curso" },
      { codigo: "en_revision" },
    ];
    expect(fallbackColumna(activasAfterDeactivation)).toBe("en_curso");
  });
});

describe("groupTareasByColumna (design D3's tradeoff — null and the first active code are equivalent)", () => {
  const activas = [
    { codigo: "por_hacer" },
    { codigo: "en_curso" },
    { codigo: "en_revision" },
  ];

  it("groups each tarea under its own columna", () => {
    const tareas = [
      { id: 1, columna: "en_curso" },
      { id: 2, columna: "en_revision" },
      { id: 3, columna: "en_curso" },
    ];
    const groups = groupTareasByColumna(tareas, activas);
    expect(groups.get("en_curso")?.map((t) => t.id)).toEqual([1, 3]);
    expect(groups.get("en_revision")?.map((t) => t.id)).toEqual([2]);
    expect(groups.get("por_hacer")).toEqual([]);
  });

  it("a null columna lands in the fallback (lowest-orden active) bucket", () => {
    const tareas = [{ id: 1, columna: null }];
    const groups = groupTareasByColumna(tareas, activas);
    expect(groups.get("por_hacer")?.map((t) => t.id)).toEqual([1]);
  });

  it("null and the first active code's literal value land in the SAME bucket (D3's equivalence)", () => {
    const tareas = [
      { id: 1, columna: null },
      { id: 2, columna: "por_hacer" },
    ];
    const groups = groupTareasByColumna(tareas, activas);
    expect(
      groups
        .get("por_hacer")
        ?.map((t) => t.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("every active column has a (possibly empty) bucket, even with zero tareas", () => {
    const groups = groupTareasByColumna([], activas);
    expect(groups.get("por_hacer")).toEqual([]);
    expect(groups.get("en_curso")).toEqual([]);
    expect(groups.get("en_revision")).toEqual([]);
  });

  it("a tarea whose stored columna is a deactivated/unknown code still renders, in the fallback bucket — cards are never dropped", () => {
    const tareas = [{ id: 1, columna: "codigo_desactivado" }];
    const groups = groupTareasByColumna(tareas, activas);
    expect(groups.get("por_hacer")?.map((t) => t.id)).toEqual([1]);
  });
});

/**
 * Slice 4b (tasks: sdd/kanban-module/tasks, design part 2 §12 — "Card
 * ordering within a column"). PURE, so no query mock is needed: v1 has no
 * manual reorder (`posicion`), so this predicate alone decides a column's
 * card order: `fecha_limite` asc (nulls last) -> `prioridad` (Alta, Media,
 * Baja — the exact `orden` the `prioridad` catalog seeds,
 * supabase/migrations/20260728182944_crm_catalogos.sql:118-120) ->
 * `created_at` asc.
 */
describe("sortTareasForBoard (design part 2 §12 — fecha_limite -> prioridad -> created_at)", () => {
  function makeTarea(overrides: {
    id: number;
    fechaLimite: string | null;
    prioridad: string | null;
    createdAt: string;
  }) {
    return overrides;
  }

  it("sorts by fechaLimite ascending when every card has a due date", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: "2026-08-10",
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: "2026-08-05",
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    expect(sortTareasForBoard(tareas).map((t) => t.id)).toEqual([2, 1]);
  });

  it("cards with no fechaLimite sort AFTER every card that has one (nulls last)", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: null,
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: "2026-08-05",
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    expect(sortTareasForBoard(tareas).map((t) => t.id)).toEqual([2, 1]);
  });

  it("ties on fechaLimite break by prioridad rank: Alta before Media before Baja", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: "2026-08-05",
        prioridad: "Baja",
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: "2026-08-05",
        prioridad: "Alta",
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 3,
        fechaLimite: "2026-08-05",
        prioridad: "Media",
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    expect(sortTareasForBoard(tareas).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("ties on fechaLimite AND prioridad break by createdAt ascending", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: null,
        prioridad: "Alta",
        createdAt: "2026-08-02T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: null,
        prioridad: "Alta",
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    expect(sortTareasForBoard(tareas).map((t) => t.id)).toEqual([2, 1]);
  });

  it("an unrecognized prioridad value sorts AFTER the three known ranks, never throws", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: "2026-08-05",
        prioridad: "codigo_desconocido",
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: "2026-08-05",
        prioridad: "Baja",
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    expect(sortTareasForBoard(tareas).map((t) => t.id)).toEqual([2, 1]);
  });

  it("does not mutate the input array", () => {
    const tareas = [
      makeTarea({
        id: 1,
        fechaLimite: "2026-08-10",
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
      makeTarea({
        id: 2,
        fechaLimite: "2026-08-05",
        prioridad: null,
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ];
    sortTareasForBoard(tareas);
    expect(tareas.map((t) => t.id)).toEqual([1, 2]);
  });
});
