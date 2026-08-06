import { describe, expect, it } from "vitest";

import {
  ESTADOS_ACTIVOS,
  VENTANA_VENCIMIENTO_HORAS,
  classify,
  esEstadoActivo,
  fechaEnvioBogota,
  horizonFrom,
} from "@/lib/notificaciones/vencimiento";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const HORA = 60 * 60 * 1000;

/** An instant `hours` from NOW, as the ISO string a `v_tarea` row carries. */
function at(hours: number): string {
  return new Date(NOW.getTime() + hours * HORA).toISOString();
}

describe("horizonFrom (slice 10)", () => {
  it("reaches exactly 72 hours ahead", () => {
    expect(VENTANA_VENCIMIENTO_HORAS).toBe(72);
    expect(horizonFrom(NOW).toISOString()).toBe("2026-08-09T12:00:00.000Z");
  });
});

describe("esEstadoActivo (slice 10)", () => {
  it("admits only pendiente and en_curso", () => {
    expect([...ESTADOS_ACTIVOS]).toEqual(["pendiente", "en_curso"]);
    expect(esEstadoActivo("pendiente")).toBe(true);
    expect(esEstadoActivo("en_curso")).toBe(true);
    expect(esEstadoActivo("borrador")).toBe(false);
    expect(esEstadoActivo("cumplido")).toBe(false);
    expect(esEstadoActivo("cancelado")).toBe(false);
  });
});

describe("classify (slice 10, spec VM1, correction C10)", () => {
  it("flags a past-due active row as vencido", () => {
    expect(classify({ estado: "pendiente", fechaLimite: at(-1) }, NOW)).toBe(
      "vencido",
    );
  });

  it("flags a row inside the 72h window as vence_pronto", () => {
    expect(classify({ estado: "en_curso", fechaLimite: at(24) }, NOW)).toBe(
      "vence_pronto",
    );
  });

  it("includes the horizon itself — exactly 72h is still vence_pronto", () => {
    expect(classify({ estado: "pendiente", fechaLimite: at(72) }, NOW)).toBe(
      "vence_pronto",
    );
  });

  it("ignores a row past the horizon", () => {
    expect(
      classify({ estado: "pendiente", fechaLimite: at(72.5) }, NOW),
    ).toBeNull();
  });

  it("treats a limit falling exactly on now as not yet overdue", () => {
    // `v_tarea.vencido` is `fecha_limite < now()`, strictly. Matching that
    // boundary is what keeps the badge, the bell and the digest agreeing.
    expect(classify({ estado: "pendiente", fechaLimite: at(0) }, NOW)).toBe(
      "vence_pronto",
    );
  });

  it("ignores a row with no fecha_limite", () => {
    expect(
      classify({ estado: "pendiente", fechaLimite: null }, NOW),
    ).toBeNull();
  });

  it("ignores an unparseable fecha_limite instead of throwing", () => {
    expect(
      classify({ estado: "pendiente", fechaLimite: "no es una fecha" }, NOW),
    ).toBeNull();
  });

  it("REGRESSION GUARD (C10/VM1): a past-due borrador yields null", () => {
    // This is the reason `classify` never reads `v_tarea.vencido`. That column
    // is TRUE for this row — `fecha_limite < now()` and the estado is not
    // terminal — so any implementation deriving the answer from it would alert
    // on a draft that has no responsable to alert.
    expect(classify({ estado: "borrador", fechaLimite: at(-48) }, NOW)).toBeNull();
  });

  it("ignores terminal rows however overdue they look", () => {
    expect(classify({ estado: "cumplido", fechaLimite: at(-48) }, NOW)).toBeNull();
    expect(
      classify({ estado: "cancelado", fechaLimite: at(-48) }, NOW),
    ).toBeNull();
  });
});

/**
 * Three-consumer parity, part 1 (the bell ↔ `v_tarea.vencido` half).
 *
 * The digest's own aggregation lands in slice 11a and completes this into a
 * three-way check. What is assertable today is the equivalence the board badge
 * and the bell both depend on.
 */
describe("parity with v_tarea.vencido, for active estados only", () => {
  /** The view's expression: `fecha_limite < now() and estado not in (terminal)`. */
  function viewVencido(estado: string, fechaLimite: string | null): boolean {
    if (fechaLimite === null) return false;
    if (estado === "cumplido" || estado === "cancelado") return false;
    return Date.parse(fechaLimite) < NOW.getTime();
  }

  it("agrees with the view on every active-estado row", () => {
    const fechas = [at(-48), at(-1), at(0), at(24), at(72), at(96), null];

    for (const estado of ESTADOS_ACTIVOS) {
      for (const fechaLimite of fechas) {
        expect(classify({ estado, fechaLimite }, NOW) === "vencido").toBe(
          viewVencido(estado, fechaLimite),
        );
      }
    }
  });

  it("deliberately DISAGREES with the view on a past-due borrador", () => {
    // Stated as a positive assertion so the divergence reads as intent rather
    // than as a bug someone should later "fix" into agreement.
    expect(viewVencido("borrador", at(-48))).toBe(true);
    expect(classify({ estado: "borrador", fechaLimite: at(-48) }, NOW)).toBeNull();
  });
});

describe("fechaEnvioBogota (slice 10)", () => {
  it("returns the Bogota calendar day for a midday instant", () => {
    expect(fechaEnvioBogota(new Date("2026-08-06T12:00:00.000Z"))).toBe(
      "2026-08-06",
    );
  });

  it("keeps 03:00 UTC on the PREVIOUS Bogota day", () => {
    // Bogota is UTC-5, so 03:00 UTC on the 7th is 22:00 on the 6th locally.
    // `digest_envio`'s once-a-day uniqueness is per Bogota day, so getting
    // this wrong would let a second digest through across the UTC boundary.
    expect(fechaEnvioBogota(new Date("2026-08-07T03:00:00.000Z"))).toBe(
      "2026-08-06",
    );
  });

  it("rolls over at 05:00 UTC, which is Bogota midnight", () => {
    expect(fechaEnvioBogota(new Date("2026-08-07T04:59:59.000Z"))).toBe(
      "2026-08-06",
    );
    expect(fechaEnvioBogota(new Date("2026-08-07T05:00:00.000Z"))).toBe(
      "2026-08-07",
    );
  });

  it("handles a year boundary", () => {
    expect(fechaEnvioBogota(new Date("2027-01-01T04:00:00.000Z"))).toBe(
      "2026-12-31",
    );
  });
});
