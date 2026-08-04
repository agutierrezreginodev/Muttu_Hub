import { describe, expect, it } from "vitest";

import {
  OTROS_SERVICIO_CODE,
  sortPipelineEstadoRows,
  topNServicioWithOtros,
  type PipelineEstadoRow,
  type PipelineServicioRow,
  OTROS_CLIENTE_ID,
  countActividadNuevos,
  formatActividadRelativeTime,
  groupActividadPorSemana,
  limitActividadFeed,
  topClientesActivos,
  type ActividadRawEvent,
  OTROS_RESPONSABLE_ID,
  sumTareasVencidas,
  topResponsablesWithOtros,
  type TareaEstadoRow,
  type TareaResponsableRow,
  sumMisTareasAbiertas,
  sumMisCompromisos,
  sumMisTareasVencidas,
  sumMisTareasVencenPronto,
  groupMiResumenPorEstado,
  type MiResumenTareaRow,
} from "@/lib/dashboard/queries";

/**
 * Task 2.3, spec dashboard-pipeline: `getPipelineEstado`/`getPipelineTotales`/
 * `getPipelineServicio` themselves hit a live Supabase client (not
 * unit-testable without a DB, same convention as `listCompromisos`/
 * `listTareasRelacionadas` in `src/lib/crm/queries.test.ts`) — this suite
 * pins down the PURE helper functions those query helpers rely on: catalog
 * `orden`-based sorting (falling back to descending count) and the top-N +
 * "Otros" fold (design.md §5 "9th+ never a new hue").
 */
describe("sortPipelineEstadoRows (task 2.3, spec: ordered by catalog orden)", () => {
  const row = (estado: string, oportunidades: number): PipelineEstadoRow => ({
    estado,
    oportunidades,
    valorTotal: 0,
  });

  it("orders rows by the catalog's orden when every estado is known", () => {
    const rows = [row("perdida", 1), row("abierta", 5), row("ganada", 2)];
    const estadoOrder = new Map([
      ["abierta", 1],
      ["ganada", 2],
      ["perdida", 3],
    ]);

    expect(
      sortPipelineEstadoRows(rows, estadoOrder).map((r) => r.estado),
    ).toEqual(["abierta", "ganada", "perdida"]);
  });

  it("falls back to descending count when NO estado has a known order", () => {
    const rows = [row("a", 1), row("b", 5), row("c", 3)];
    const estadoOrder = new Map<string, number>();

    expect(
      sortPipelineEstadoRows(rows, estadoOrder).map((r) => r.estado),
    ).toEqual(["b", "c", "a"]);
  });

  it("places ordered estados before unordered ones, unordered ones sorted by descending count", () => {
    const rows = [
      row("unknown-low", 1),
      row("abierta", 5),
      row("unknown-high", 9),
    ];
    const estadoOrder = new Map([["abierta", 1]]);

    expect(
      sortPipelineEstadoRows(rows, estadoOrder).map((r) => r.estado),
    ).toEqual(["abierta", "unknown-high", "unknown-low"]);
  });

  it("never mutates the input array", () => {
    const rows = [row("b", 1), row("a", 2)];
    const original = [...rows];
    sortPipelineEstadoRows(rows, new Map());
    expect(rows).toEqual(original);
  });
});

describe("topNServicioWithOtros (task 2.3, design.md §5 top-N + Otros)", () => {
  const row = (
    servicioCodigo: string,
    oportunidades: number,
  ): PipelineServicioRow => ({
    servicioCodigo,
    oportunidades,
  });

  it("returns rows unchanged (sorted desc) when at or under the top-N", () => {
    const rows = [row("a", 1), row("b", 3), row("c", 2)];
    expect(topNServicioWithOtros(rows, 8).map((r) => r.servicioCodigo)).toEqual(
      ["b", "c", "a"],
    );
  });

  it("folds everything beyond the top N into a single Otros bucket", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`s${i}`, 10 - i));
    const result = topNServicioWithOtros(rows, 3);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ servicioCodigo: "s0", oportunidades: 10 });
    expect(result[1]).toEqual({ servicioCodigo: "s1", oportunidades: 9 });
    expect(result[2]).toEqual({ servicioCodigo: "s2", oportunidades: 8 });
    // Remaining s3..s9 = 7+6+5+4+3+2+1 = 28
    expect(result[3]).toEqual({
      servicioCodigo: OTROS_SERVICIO_CODE,
      oportunidades: 28,
    });
  });

  it("never invents/reuses a real servicio code for the Otros bucket", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`s${i}`, 9 - i));
    const result = topNServicioWithOtros(rows, 8);
    const otros = result.find((r) => r.servicioCodigo === OTROS_SERVICIO_CODE);
    expect(otros).toBeDefined();
    expect(rows.some((r) => r.servicioCodigo === OTROS_SERVICIO_CODE)).toBe(
      false,
    );
  });
});

/**
 * Task 3.3, spec dashboard-actividad: `getActividadWindow` itself hits a
 * live Supabase client (not unit-testable without a DB, same convention as
 * `getPipelineEstado`/`listCompromisos`) — this suite pins down the PURE
 * helpers the Actividad query layer builds on top of the single windowed
 * fetch (design.md §4.3: "one query replaces N+1 per-cliente reads").
 */
function event(
  tipo: ActividadRawEvent["tipo"],
  clienteId: number,
  ocurridoEn: string,
  overrides: Partial<ActividadRawEvent> = {},
): ActividadRawEvent {
  return {
    tipo,
    clienteId,
    actorId: null,
    detalle: `detalle-${tipo}-${clienteId}`,
    ocurridoEn,
    ...overrides,
  };
}

describe("limitActividadFeed (task 3.3, spec: windowed feed)", () => {
  it("slices to the default limit (20), preserving order", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      event(
        "bitacora",
        1,
        `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      ),
    );
    const result = limitActividadFeed(rows);
    expect(result).toHaveLength(20);
    expect(result).toEqual(rows.slice(0, 20));
  });

  it("respects an explicit limit", () => {
    const rows = [
      event("bitacora", 1, "2026-01-01T00:00:00Z"),
      event("bitacora", 1, "2026-01-02T00:00:00Z"),
    ];
    expect(limitActividadFeed(rows, 1)).toEqual([rows[0]]);
  });

  it("never mutates the input array", () => {
    const rows = [event("bitacora", 1, "2026-01-01T00:00:00Z")];
    const original = [...rows];
    limitActividadFeed(rows, 0);
    expect(rows).toEqual(original);
  });
});

describe("groupActividadPorSemana (task 3.3, spec: activity volume over time)", () => {
  it("groups same-week events into one bucket and returns buckets ascending by week", () => {
    const rows = [
      event("bitacora", 1, "2026-01-05T08:00:00Z"),
      event("contacto_nuevo", 1, "2026-01-07T08:00:00Z"),
      event("oportunidad_nueva", 1, "2026-01-20T08:00:00Z"),
    ];
    const result = groupActividadPorSemana(rows);

    expect(result).toHaveLength(2);
    expect(result[0].eventos).toBe(2);
    expect(result[1].eventos).toBe(1);
    expect(result[0].semana < result[1].semana).toBe(true);
  });

  it("returns an empty array for no rows", () => {
    expect(groupActividadPorSemana([])).toEqual([]);
  });
});

describe("topClientesActivos (task 3.3, spec: most active clientes)", () => {
  it("ranks clientes by event count, descending", () => {
    const rows = [
      event("bitacora", 1, "2026-01-01T00:00:00Z"),
      event("bitacora", 1, "2026-01-02T00:00:00Z"),
      event("bitacora", 2, "2026-01-01T00:00:00Z"),
    ];
    expect(topClientesActivos(rows, 8)).toEqual([
      { clienteId: 1, eventos: 2 },
      { clienteId: 2, eventos: 1 },
    ]);
  });

  it("folds everything beyond top N into a single Otros bucket, sentinel id never a real cliente id", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      event("bitacora", i + 1, "2026-01-01T00:00:00Z"),
    ).flatMap((base, i) => Array.from({ length: 10 - i }, () => base));
    const result = topClientesActivos(rows, 3);

    expect(result).toHaveLength(4);
    expect(result[3].clienteId).toBe(OTROS_CLIENTE_ID);
    expect(rows.some((r) => r.clienteId === OTROS_CLIENTE_ID)).toBe(false);
  });
});

describe("countActividadNuevos (task 3.3, spec: new-this-period headlines)", () => {
  it("counts only contacto_nuevo and oportunidad_nueva, ignoring bitacora/oportunidad_gestion", () => {
    const rows = [
      event("contacto_nuevo", 1, "2026-01-01T00:00:00Z"),
      event("contacto_nuevo", 1, "2026-01-02T00:00:00Z"),
      event("oportunidad_nueva", 1, "2026-01-01T00:00:00Z"),
      event("oportunidad_gestion", 1, "2026-01-01T00:00:00Z"),
      event("bitacora", 1, "2026-01-01T00:00:00Z"),
    ];
    expect(countActividadNuevos(rows)).toEqual({
      nuevosContactos: 2,
      nuevasOportunidades: 1,
    });
  });

  it("returns zeros for no rows", () => {
    expect(countActividadNuevos([])).toEqual({
      nuevosContactos: 0,
      nuevasOportunidades: 0,
    });
  });
});

describe("formatActividadRelativeTime (task 3.3/3.6, spec: relative timestamp on each feed item)", () => {
  const now = new Date("2026-08-03T12:00:00Z");

  it("formats a past timestamp in hours", () => {
    expect(formatActividadRelativeTime("2026-08-03T09:00:00Z", now)).toMatch(
      /hor/,
    );
  });

  it("formats a past timestamp in days", () => {
    // 5 days back (not 1-2, which "numeric: auto" renders idiomatically as
    // "ayer"/"anteayer" — neither contains "d").
    expect(formatActividadRelativeTime("2026-07-29T12:00:00Z", now)).toMatch(
      /d/,
    );
  });

  it("formats a just-now timestamp in seconds/minutes, never throwing", () => {
    expect(() =>
      formatActividadRelativeTime("2026-08-03T11:59:50Z", now),
    ).not.toThrow();
  });
});

/**
 * Task 4.3, spec dashboard-tareas: `getTareasEstado`/`getTareasResponsable`/
 * `getTareasThroughput` themselves hit a live Supabase client (not
 * unit-testable without a DB, same convention as every other dashboard
 * query helper) — this suite pins down the PURE helpers on top of them.
 * "Estados read from data, not hardcoded" is proven structurally: these
 * helpers never branch on a fixed estado list, they operate on whatever
 * `estado` strings the rows carry — exercised here with an invented estado
 * string that does not exist in `tarea`'s current check constraint, to
 * prove nothing is hardcoded against the known five values.
 */
describe("sumTareasVencidas (task 4.3, spec: Overdue (vencidas) headline)", () => {
  const row = (
    estado: string,
    tareas: number,
    vencidas: number,
  ): TareaEstadoRow => ({
    estado,
    tareas,
    vencidas,
  });

  it("sums vencidas across every estado row", () => {
    const rows = [
      row("pendiente", 4, 2),
      row("en_curso", 3, 1),
      row("cumplido", 5, 0),
    ];
    expect(sumTareasVencidas(rows)).toBe(3);
  });

  it("never hardcodes an estado list — an unknown/future estado's vencidas still count", () => {
    const rows = [row("en_revision_futura", 2, 2)];
    expect(sumTareasVencidas(rows)).toBe(2);
  });

  it("returns 0 for no rows", () => {
    expect(sumTareasVencidas([])).toBe(0);
  });
});

describe("topResponsablesWithOtros (task 4.3, spec: Open tareas by responsable)", () => {
  const row = (
    responsableId: string | null,
    abiertas: number,
    vencidas: number,
  ): TareaResponsableRow => ({ responsableId, abiertas, vencidas });

  it("drops the null-responsable group (unassigned borrador tareas)", () => {
    const rows = [row(null, 3, 1), row("a", 2, 0)];
    const result = topResponsablesWithOtros(rows, 8);
    expect(result).toHaveLength(1);
    expect(result[0]?.responsableId).toBe("a");
  });

  it("returns rows sorted by abiertas descending when at or under the top-N", () => {
    const rows = [row("a", 1, 0), row("b", 3, 1), row("c", 2, 0)];
    expect(
      topResponsablesWithOtros(rows, 8).map((r) => r.responsableId),
    ).toEqual(["b", "c", "a"]);
  });

  it("folds everything beyond the top N into a single Otros bucket, summing both abiertas and vencidas", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`, 10 - i, i));
    const result = topResponsablesWithOtros(rows, 3);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      responsableId: "r0",
      abiertas: 10,
      vencidas: 0,
    });
    expect(result[1]).toEqual({
      responsableId: "r1",
      abiertas: 9,
      vencidas: 1,
    });
    expect(result[2]).toEqual({
      responsableId: "r2",
      abiertas: 8,
      vencidas: 2,
    });
    // Remaining r3..r9: abiertas 7+6+5+4+3+2+1=28, vencidas 3+4+5+6+7+8+9=42
    expect(result[3]).toEqual({
      responsableId: OTROS_RESPONSABLE_ID,
      abiertas: 28,
      vencidas: 42,
    });
  });

  it("never invents/reuses a real responsable id for the Otros bucket", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`r${i}`, 9 - i, 0));
    const result = topResponsablesWithOtros(rows, 8);
    const otros = result.find((r) => r.responsableId === OTROS_RESPONSABLE_ID);
    expect(otros).toBeDefined();
    expect(rows.some((r) => r.responsableId === OTROS_RESPONSABLE_ID)).toBe(
      false,
    );
  });
});

/**
 * Task 5.3, spec dashboard-mi-resumen: `getMiResumenTareas`/`getMisClientes`/
 * `getMiAgenda` themselves hit a live Supabase client (not unit-testable
 * without a DB, same convention as every other dashboard query helper) —
 * this suite pins down the PURE helpers over `v_dashboard_mi_resumen_tareas`
 * rows. Task 5.7 (Kanban tarea contract re-confirmed, see apply-progress):
 * `sumMisTareasAbiertas`/`sumMisTareasVencidas`/`sumMisTareasVencenPronto`
 * are FULL-ORIGEN (never filter by `origen`) — only `sumMisCompromisos` is
 * the CRM/Ambos-only independent slice.
 */
describe("Mi Resumen pure helpers (task 5.3/5.7, spec dashboard-mi-resumen)", () => {
  const row = (
    estado: string,
    origen: string,
    tareas: number,
    vencidas: number,
    vencenPronto: number,
  ): MiResumenTareaRow => ({ estado, origen, tareas, vencidas, vencenPronto });

  describe("sumMisTareasAbiertas (full-origen, task 5.7)", () => {
    it("sums tareas across pendiente/en_curso for EVERY origen, including Kanban", () => {
      const rows = [
        row("pendiente", "CRM", 2, 0, 0),
        row("en_curso", "Kanban", 3, 0, 0),
        row("pendiente", "Ambos", 1, 0, 0),
        row("cumplido", "CRM", 5, 0, 0),
      ];
      expect(sumMisTareasAbiertas(rows)).toBe(6);
    });

    it("returns 0 when nothing is open", () => {
      expect(sumMisTareasAbiertas([row("cumplido", "CRM", 4, 0, 0)])).toBe(0);
    });
  });

  describe("sumMisCompromisos (CRM/Ambos-only, independent slice)", () => {
    it("counts only non-terminal CRM/Ambos rows, excluding Kanban-only rows", () => {
      const rows = [
        row("pendiente", "CRM", 2, 0, 0),
        row("en_curso", "Ambos", 3, 0, 0),
        row("en_curso", "Kanban", 10, 0, 0), // excluded: Kanban-only
        row("cumplido", "CRM", 5, 0, 0), // excluded: terminal
        row("cancelado", "Ambos", 1, 0, 0), // excluded: terminal
      ];
      expect(sumMisCompromisos(rows)).toBe(5);
    });
  });

  describe("sumMisTareasVencidas (full-origen, task 5.7)", () => {
    it("sums the vencidas column across every estado/origen row", () => {
      const rows = [
        row("pendiente", "CRM", 2, 1, 0),
        row("en_curso", "Kanban", 3, 2, 0),
        row("pendiente", "Ambos", 1, 0, 0),
      ];
      expect(sumMisTareasVencidas(rows)).toBe(3);
    });
  });

  describe("sumMisTareasVencenPronto (full-origen, task 5.7)", () => {
    it("sums the vencen_pronto column across every estado/origen row", () => {
      const rows = [
        row("pendiente", "CRM", 2, 0, 1),
        row("en_curso", "Kanban", 3, 0, 2),
        row("cumplido", "Ambos", 1, 0, 0),
      ];
      expect(sumMisTareasVencenPronto(rows)).toBe(3);
    });
  });

  describe("groupMiResumenPorEstado (task 5.3, small by-estado bar)", () => {
    it("folds tareas across origen into one total per estado, never hardcoded", () => {
      const rows = [
        row("pendiente", "CRM", 2, 0, 0),
        row("pendiente", "Kanban", 3, 0, 0),
        row("en_revision_futura", "Ambos", 1, 0, 0), // invented estado — proves nothing is hardcoded
      ];
      const result = groupMiResumenPorEstado(rows);
      expect(result).toEqual(
        expect.arrayContaining([
          { estado: "pendiente", tareas: 5 },
          { estado: "en_revision_futura", tareas: 1 },
        ]),
      );
      expect(result).toHaveLength(2);
    });

    it("returns [] for no rows", () => {
      expect(groupMiResumenPorEstado([])).toEqual([]);
    });
  });
});
