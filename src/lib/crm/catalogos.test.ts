import { describe, expect, it } from "vitest";

import {
  activeCatalogoOptions,
  resolveCatalogoLabel,
  type CatalogoOptionsMap,
} from "@/lib/crm/catalogos";

/**
 * Task 6.14 (spec: "display resolves stored codes (including deactivated
 * ones) so history stays readable"). Mirrors resolveUsuarioLabel's test
 * intent, adapted for the getCatalogoOptions/resolveCatalogoLabel pattern
 * (design: "the exact getUsuarioDirectory/resolveUsuarioLabel pattern").
 */
function buildMap(): CatalogoOptionsMap {
  const map: CatalogoOptionsMap = new Map();
  map.set("nivel_madurez", [
    { codigo: "temprano", etiqueta: "Temprano", orden: 1, activo: true },
    { codigo: "avanzado", etiqueta: "Avanzado", orden: 2, activo: true },
    // Deactivated code — still resolvable for history (CAT-adjacent rule).
    {
      codigo: "obsoleto",
      etiqueta: "Obsoleto (histórico)",
      orden: 3,
      activo: false,
    },
  ]);
  return map;
}

describe("resolveCatalogoLabel (task 6.14)", () => {
  it("resolves an active code to its etiqueta", () => {
    expect(resolveCatalogoLabel(buildMap(), "nivel_madurez", "temprano")).toBe(
      "Temprano",
    );
  });

  it("resolves a DEACTIVATED code to its etiqueta — history stays readable", () => {
    expect(resolveCatalogoLabel(buildMap(), "nivel_madurez", "obsoleto")).toBe(
      "Obsoleto (histórico)",
    );
  });

  it("returns the em dash for a null codigo", () => {
    expect(resolveCatalogoLabel(buildMap(), "nivel_madurez", null)).toBe("—");
  });

  it("falls back to the raw codigo when a tipo/codigo pair is entirely unknown", () => {
    expect(resolveCatalogoLabel(buildMap(), "nivel_madurez", "no-existe")).toBe(
      "no-existe",
    );
  });

  it("returns the raw codigo when the tipo itself has no entries in the map", () => {
    expect(
      resolveCatalogoLabel(buildMap(), "tamano_organizacion", "grande"),
    ).toBe("grande");
  });
});

describe("activeCatalogoOptions (task 6.2)", () => {
  it("filters out deactivated codes — forms must offer active codes only", () => {
    const options = activeCatalogoOptions(buildMap(), "nivel_madurez");
    expect(options.map((option) => option.codigo)).toEqual([
      "temprano",
      "avanzado",
    ]);
  });

  it("returns an empty array for a tipo with no entries", () => {
    expect(activeCatalogoOptions(buildMap(), "canal_contacto")).toEqual([]);
  });
});
