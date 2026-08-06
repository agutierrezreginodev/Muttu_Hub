import { describe, expect, it } from "vitest";

import { classify } from "../_shared/vencimiento.ts";
import { aggregate, type DigestRow } from "./aggregate.ts";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const HORA = 60 * 60 * 1000;
const at = (hours: number) =>
  new Date(NOW.getTime() + hours * HORA).toISOString();

/**
 * One fixture set covering every interesting corner: overdue, due at the
 * boundary, due inside and outside the window, undated, terminal, and the
 * past-due borrador that the view calls overdue and the model does not.
 */
const FIXTURE: DigestRow[] = [
  { id: 1, titulo: "Vencida", fecha_limite: at(-48), estado: "pendiente", origen: "Kanban", cliente_id: null },
  { id: 2, titulo: "Vence en 1h", fecha_limite: at(1), estado: "en_curso", origen: "CRM", cliente_id: 5 },
  { id: 3, titulo: "Justo en el horizonte", fecha_limite: at(72), estado: "pendiente", origen: "Ambos", cliente_id: 9 },
  { id: 4, titulo: "Pasado el horizonte", fecha_limite: at(96), estado: "pendiente", origen: "Kanban", cliente_id: null },
  { id: 5, titulo: "Sin fecha", fecha_limite: null, estado: "pendiente", origen: "Kanban", cliente_id: null },
  { id: 6, titulo: "Cumplida y vieja", fecha_limite: at(-72), estado: "cumplido", origen: "Kanban", cliente_id: null },
  { id: 7, titulo: "Cancelada y vieja", fecha_limite: at(-72), estado: "cancelado", origen: "CRM", cliente_id: 3 },
  { id: 8, titulo: "Borrador vencido", fecha_limite: at(-48), estado: "borrador", origen: "CRM", cliente_id: 4 },
];

/**
 * The board badge's partition. The board reads `v_tarea.vencido` directly
 * (KB4), so this models the view's own expression rather than calling our
 * code — otherwise the test would be comparing `classify` against itself.
 */
function boardOverdue(row: DigestRow): boolean {
  if (row.fecha_limite === null) return false;
  if (row.estado === "cumplido" || row.estado === "cancelado") return false;
  return Date.parse(row.fecha_limite) < NOW.getTime();
}

/** The bell's partition: `src/lib/notificaciones/queries.ts`'s two gates. */
function bellItems(rows: DigestRow[]): number[] {
  return rows
    .filter((row) => {
      if (!["pendiente", "en_curso"].includes(row.estado)) return false;
      if (row.fecha_limite === null) return false;
      return Date.parse(row.fecha_limite) <= NOW.getTime() + 72 * HORA;
    })
    .filter(
      (row) =>
        classify({ estado: row.estado, fechaLimite: row.fecha_limite }, NOW) !==
        null,
    )
    .map((row) => row.id);
}

/**
 * Three-consumer parity, COMPLETED (slice 11a; part 1 landed in slice 10).
 *
 * The board badge, the bell and the digest each decide independently what is
 * overdue or nearly so. They are allowed to show DIFFERENT SUBSETS — the badge
 * only marks overdue, the other two also carry due-soon — but where their
 * questions overlap they must never disagree, or the same task shows up red on
 * one screen and absent from another.
 */
describe("three-consumer parity (slice 11a)", () => {
  it("the digest and the bell select exactly the same rows", () => {
    const digestIds = aggregate(FIXTURE, NOW).map((item) => item.id);

    expect(digestIds.sort()).toEqual(bellItems(FIXTURE).sort());
  });

  it("the digest's overdue set matches the board badge's, for active rows", () => {
    const digestOverdue = aggregate(FIXTURE, NOW)
      .filter((item) => item.estado === "vencido")
      .map((item) => item.id)
      .sort();

    const badgeOverdue = FIXTURE.filter(
      (row) => ["pendiente", "en_curso"].includes(row.estado) && boardOverdue(row),
    )
      .map((row) => row.id)
      .sort();

    expect(digestOverdue).toEqual(badgeOverdue);
  });

  it("all three agree the past-due borrador is the board's alone", () => {
    // The badge marks it (the view's `vencido` is true). Neither the bell nor
    // the digest alerts on it, because it has no responsable to alert. Stated
    // as intent so nobody reconciles the three into false agreement.
    const borrador = FIXTURE.find((row) => row.id === 8)!;

    expect(boardOverdue(borrador)).toBe(true);
    expect(bellItems([borrador])).toEqual([]);
    expect(aggregate([borrador], NOW)).toEqual([]);
  });

  it("selects the rows the fixture says it should, and no others", () => {
    // Pinned explicitly so a change in any consumer has to restate the answer
    // rather than move all three together into a new, unexamined agreement.
    expect(aggregate(FIXTURE, NOW).map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
