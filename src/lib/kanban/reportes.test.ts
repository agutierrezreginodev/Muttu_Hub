import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SIN_PRIORIDAD,
  SIN_RESPONSABLE,
  buildReporte,
  type ReporteRow,
} from "@/lib/kanban/reportes";

function row(overrides: Partial<ReporteRow> = {}): ReporteRow {
  return {
    responsableId: "u1",
    estado: "pendiente",
    prioridad: "Media",
    etiquetas: [],
    vencido: false,
    ...overrides,
  };
}

const sum = (items: { total: number }[]) =>
  items.reduce((acc, item) => acc + item.total, 0);

/**
 * Slice 8 (spec KR1, design D8). Every distribution is computed HERE, in pure
 * TypeScript over rows the board already fetched — no SQL aggregation, no new
 * view, no new database object. That is a deliberate constraint, not an
 * oversight: the reports must show exactly what the caller's RLS-filtered
 * board shows, and a separate aggregate query is a second chance to disagree
 * with it.
 */
describe("buildReporte (slice 8, spec KR1)", () => {
  it("returns an empty report for no rows rather than throwing", () => {
    const reporte = buildReporte([]);

    expect(reporte).toEqual({
      total: 0,
      vencidas: 0,
      porResponsable: [],
      porEstado: [],
      porEtiqueta: [],
      porPrioridad: [],
    });
  });

  it("counts the total and the overdue subset", () => {
    const reporte = buildReporte([
      row({ vencido: true }),
      row({ vencido: true }),
      row({ vencido: false }),
    ]);

    expect(reporte.total).toBe(3);
    expect(reporte.vencidas).toBe(2);
  });

  it("reads `vencido` off the row and never recomputes it from a date", () => {
    // KB4: `v_tarea.vencido` is the single source of truth for overdue-ness.
    // A row flagged overdue counts as overdue even with no other signal.
    const reporte = buildReporte([row({ vencido: true, prioridad: null })]);

    expect(reporte.vencidas).toBe(1);
  });

  it("groups by responsable, bucketing the unassigned under a sentinel", () => {
    const reporte = buildReporte([
      row({ responsableId: "u1" }),
      row({ responsableId: "u1" }),
      row({ responsableId: "u2" }),
      row({ responsableId: null }),
    ]);

    expect(reporte.porResponsable).toEqual([
      { clave: "u1", total: 2 },
      { clave: SIN_RESPONSABLE, total: 1 },
      { clave: "u2", total: 1 },
    ]);
  });

  it("groups by estado", () => {
    const reporte = buildReporte([
      row({ estado: "pendiente" }),
      row({ estado: "en_curso" }),
      row({ estado: "en_curso" }),
    ]);

    expect(reporte.porEstado).toEqual([
      { clave: "en_curso", total: 2 },
      { clave: "pendiente", total: 1 },
    ]);
  });

  it("groups by prioridad, bucketing the unset under a sentinel", () => {
    const reporte = buildReporte([
      row({ prioridad: "Alta" }),
      row({ prioridad: null }),
      row({ prioridad: null }),
    ]);

    expect(reporte.porPrioridad).toEqual([
      { clave: SIN_PRIORIDAD, total: 2 },
      { clave: "Alta", total: 1 },
    ]);
  });

  it("keeps the single-valued distributions summing to the row total", () => {
    // The sentinels exist to make this invariant hold. Without them a board
    // with unassigned cards would render a distribution that quietly loses
    // rows, and a reader would have no way to notice.
    const rows = [
      row({ responsableId: null, prioridad: null }),
      row({ responsableId: "u1", prioridad: "Alta" }),
      row({ responsableId: "u2", prioridad: null }),
    ];
    const reporte = buildReporte(rows);

    expect(sum(reporte.porResponsable)).toBe(reporte.total);
    expect(sum(reporte.porEstado)).toBe(reporte.total);
    expect(sum(reporte.porPrioridad)).toBe(reporte.total);
  });

  it("counts a multi-tag row once per tag", () => {
    const reporte = buildReporte([
      row({ etiquetas: ["comercial", "interno"] }),
      row({ etiquetas: ["comercial"] }),
    ]);

    expect(reporte.porEtiqueta).toEqual([
      { clave: "comercial", total: 2 },
      { clave: "interno", total: 1 },
    ]);
  });

  it("leaves an untagged row out of the etiqueta distribution entirely", () => {
    // `etiquetas` is multi-valued, so no sentinel can make this distribution
    // sum to the total the way the others do — the sum can exceed it (multi-
    // tag rows) or fall short of it (untagged rows). Asserted rather than
    // merely documented, so a later "fix" to make it sum has to face a test.
    const reporte = buildReporte([
      row({ etiquetas: [] }),
      row({ etiquetas: ["comercial"] }),
    ]);

    expect(reporte.total).toBe(2);
    expect(sum(reporte.porEtiqueta)).toBe(1);
    expect(reporte.porEtiqueta).toEqual([{ clave: "comercial", total: 1 }]);
  });

  it("orders every distribution by count descending, then by key, so ties are stable", () => {
    // Insertion order would make the render depend on however the rows
    // happened to arrive from Postgres — a report that reshuffles between
    // loads for no visible reason.
    const reporte = buildReporte([
      row({ estado: "zeta" }),
      row({ estado: "alfa" }),
      row({ estado: "medio" }),
      row({ estado: "medio" }),
    ]);

    expect(reporte.porEstado.map((item) => item.clave)).toEqual([
      "medio",
      "alfa",
      "zeta",
    ]);
  });

  it("does not mutate the rows it was given", () => {
    const rows: ReporteRow[] = [row({ etiquetas: ["comercial"] })];
    const snapshot = structuredClone(rows);

    buildReporte(rows);

    expect(rows).toEqual(snapshot);
  });
});

/**
 * KR2 is "on-screen reports, no export" — a scope boundary, not a preference.
 * The UI half is asserted in the RTL and E2E specs; this is the supply-chain
 * half, and it is the one a reviewer cannot eyeball. An export feature arrives
 * as a dependency long before it arrives as a button.
 */
describe("KR2 — reports stay on-screen", () => {
  it("adds no spreadsheet, PDF or CSV dependency to package.json", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const installed = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });

    const exporters =
      /^(xlsx|exceljs|jspdf|pdfkit|papaparse|json2csv|csv-stringify|file-saver)$/;
    expect(installed.filter((name) => exporters.test(name))).toEqual([]);
  });
});
