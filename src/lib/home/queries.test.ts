import { describe, expect, it } from "vitest";

import { TERMINAL_COLUMNA_ESTADO } from "@/lib/kanban/columnas";
import {
  ESTADO_CLIENTE_ACTIVO,
  OPORTUNIDAD_CERRADA_ESTADOS,
  TAREA_DONE_ESTADOS,
  assembleHomeKpis,
  type HomeKpiOutcomes,
} from "@/lib/home/queries";

/**
 * Home KPI grid (task: home KPIs). `getHomeKpis` is five thin supabase count
 * queries, so this suite tests the PURE core instead of mocking supabase (the
 * same split `src/lib/kanban/columnas.ts` sets): the filter-definition
 * constants and `assembleHomeKpis`' per-KPI fallback rule — an errored or
 * rejected query degrades ONLY its own card to `null` (rendered "—"), never
 * the whole grid, because this page is demo-critical.
 */
describe("KPI filter constants", () => {
  it("activo is the estado_cliente code filtered on (catalog seed, codigo is immutable)", () => {
    expect(ESTADO_CLIENTE_ACTIVO).toBe("activo");
  });

  it("closed oportunidad states are exactly ganada/perdida (won/lost)", () => {
    expect(OPORTUNIDAD_CERRADA_ESTADOS).toEqual(["ganada", "perdida"]);
  });

  it("does NOT mark today's open oportunidad states as closed", () => {
    for (const abierta of ["abierta", "en_curso"]) {
      expect(
        (OPORTUNIDAD_CERRADA_ESTADOS as readonly string[]).includes(abierta),
      ).toBe(false);
    }
  });

  it("done tarea states come from TERMINAL_COLUMNA_ESTADO — the single source of truth v_tarea.vencido's SQL mirrors", () => {
    expect(TAREA_DONE_ESTADOS).toEqual(Object.values(TERMINAL_COLUMNA_ESTADO));
    expect(TAREA_DONE_ESTADOS).toEqual(["cumplido", "cancelado"]);
  });

  it("done vs pending EXHAUSTIVELY partitions every tarea.estado the demo seed uses", () => {
    for (const estado of ["pendiente", "en_curso", "cumplido", "cancelado"]) {
      const isDone = TAREA_DONE_ESTADOS.includes(estado);
      expect(isDone).toBe(estado === "cumplido" || estado === "cancelado");
    }
  });
});

describe("assembleHomeKpis (per-KPI fallback-on-error)", () => {
  const allOk: HomeKpiOutcomes = {
    clientesActivos: { count: 2, error: null },
    oportunidadesAbiertas: { count: 3, error: null },
    tareasPendientes: { count: 6, error: null },
    tareasVencidas: { count: 1, error: null },
    documentos: { count: 4, error: null },
  };

  it("maps every count through when no query errors", () => {
    expect(assembleHomeKpis(allOk)).toEqual({
      clientesActivos: 2,
      oportunidadesAbiertas: 3,
      tareasPendientes: 6,
      tareasVencidas: 1,
      documentos: 4,
    });
  });

  it("degrades ONLY the errored KPI to null — the other four keep their counts", () => {
    const kpis = assembleHomeKpis({
      ...allOk,
      tareasVencidas: { count: null, error: new Error("boom") },
    });

    expect(kpis.tareasVencidas).toBeNull();
    expect(kpis.clientesActivos).toBe(2);
    expect(kpis.oportunidadesAbiertas).toBe(3);
    expect(kpis.tareasPendientes).toBe(6);
    expect(kpis.documentos).toBe(4);
  });

  it("maps a REJECTED promise (count null + error) to null, same as a supabase error", () => {
    const kpis = assembleHomeKpis({
      ...allOk,
      documentos: { count: null, error: new Error("network") },
    });

    expect(kpis.documentos).toBeNull();
  });

  it("keeps a legit ZERO count as 0 — never confused with the failure fallback", () => {
    const kpis = assembleHomeKpis({
      ...allOk,
      tareasVencidas: { count: 0, error: null },
    });

    expect(kpis.tareasVencidas).toBe(0);
  });

  it("treats a null count WITHOUT error as 0 — null means 'query failed' exclusively", () => {
    const kpis = assembleHomeKpis({
      ...allOk,
      clientesActivos: { count: null, error: null },
    });

    expect(kpis.clientesActivos).toBe(0);
  });
});
