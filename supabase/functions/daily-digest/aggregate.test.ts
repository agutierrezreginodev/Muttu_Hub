import { describe, expect, it } from "vitest";

import { aggregate, type DigestRow } from "./aggregate.ts";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const HORA = 60 * 60 * 1000;
const at = (hours: number) =>
  new Date(NOW.getTime() + hours * HORA).toISOString();

function row(overrides: Partial<DigestRow> = {}): DigestRow {
  return {
    id: 1,
    titulo: "Enviar propuesta",
    fecha_limite: at(-2),
    estado: "pendiente",
    origen: "Kanban",
    cliente_id: null,
    ...overrides,
  };
}

describe("aggregate (slice 11a)", () => {
  it("classifies overdue and due-soon rows", () => {
    const items = aggregate(
      [
        row({ id: 1, fecha_limite: at(-2) }),
        row({ id: 2, fecha_limite: at(24), estado: "en_curso" }),
      ],
      NOW,
    );

    expect(items).toEqual([
      expect.objectContaining({ id: 1, estado: "vencido" }),
      expect.objectContaining({ id: 2, estado: "vence_pronto" }),
    ]);
  });

  it("excludes a past-due borrador (C10/VM1)", () => {
    // Same guard the bell has. The digest is the consumer where getting this
    // wrong is loudest: an email nagging someone about a draft they never
    // owned, at 07:00, every day.
    expect(aggregate([row({ estado: "borrador", fecha_limite: at(-48) })], NOW))
      .toEqual([]);
  });

  it("excludes terminal rows and rows past the horizon", () => {
    expect(
      aggregate(
        [
          row({ id: 1, estado: "cumplido", fecha_limite: at(-48) }),
          row({ id: 2, estado: "cancelado", fecha_limite: at(-48) }),
          row({ id: 3, fecha_limite: at(96) }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("excludes rows with no fecha límite", () => {
    expect(aggregate([row({ fecha_limite: null })], NOW)).toEqual([]);
  });

  it("orders by fecha límite, most urgent first", () => {
    const items = aggregate(
      [
        row({ id: 1, fecha_limite: at(48), estado: "en_curso" }),
        row({ id: 2, fecha_limite: at(-48) }),
        row({ id: 3, fecha_limite: at(2), estado: "en_curso" }),
      ],
      NOW,
    );

    expect(items.map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("carries origen and clienteId through, so links can be built", () => {
    const items = aggregate(
      [row({ origen: "Ambos", cliente_id: 42 })],
      NOW,
    );

    expect(items[0]).toMatchObject({ origen: "Ambos", clienteId: 42 });
  });

  it("classifies against the instant it is GIVEN, not against the wall clock", () => {
    // `now` is a parameter rather than read inside, so every recipient in one
    // run is classified against the same instant instead of drifting as the
    // loop takes time. The same row reads differently under two clocks, which
    // is precisely why the caller must own the clock.
    const rows = [row({ fecha_limite: at(0.5), estado: "en_curso" })];

    expect(aggregate(rows, NOW)[0]).toMatchObject({ estado: "vence_pronto" });
    expect(
      aggregate(rows, new Date(NOW.getTime() + 2 * HORA))[0],
    ).toMatchObject({ estado: "vencido" });
    expect(
      aggregate(rows, new Date(NOW.getTime() - 200 * HORA)),
    ).toEqual([]);
  });
});
