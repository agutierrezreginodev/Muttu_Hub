import { describe, expect, it } from "vitest";

import {
  BOARD_SCOPES,
  SCOPE_PARAM,
  buildBoardHref,
  parseBoardFilters,
  parseScope,
} from "@/lib/kanban/filtros";

describe("parseScope (design D10 — scope comes from the URL)", () => {
  it("reads the mine scope", () => {
    expect(parseScope("mio")).toBe(BOARD_SCOPES.mio);
  });

  it("reads the team scope", () => {
    expect(parseScope("equipo")).toBe(BOARD_SCOPES.equipo);
  });

  it("defaults to the team scope when the param is absent", () => {
    expect(parseScope(undefined)).toBe(BOARD_SCOPES.equipo);
  });

  it("defaults to the team scope for a value it does not recognise", () => {
    // A malformed URL must never silently NARROW the board: missing cards read
    // as lost data, while an unexpectedly wide board is self-evidently unfiltered.
    expect(parseScope("todo")).toBe(BOARD_SCOPES.equipo);
    expect(parseScope("")).toBe(BOARD_SCOPES.equipo);
  });
});

describe("scope hrefs (built through buildBoardHref)", () => {
  it("sets the scope param", () => {
    expect(
      buildBoardHref("/kanban", {}, { [SCOPE_PARAM]: BOARD_SCOPES.mio }),
    ).toBe(`/kanban?${SCOPE_PARAM}=mio`);
  });

  it("writes the team scope explicitly instead of omitting it", () => {
    // A shared link should keep meaning what it meant, even if the default
    // changes later.
    expect(
      buildBoardHref("/kanban", {}, { [SCOPE_PARAM]: BOARD_SCOPES.equipo }),
    ).toBe(`/kanban?${SCOPE_PARAM}=equipo`);
  });

  it("preserves the other search params", () => {
    // KV1 filters share this URL. Dropping them here would reset a user's
    // filters every time they flipped the scope.
    const href = buildBoardHref(
      "/kanban",
      { prioridad: "Alta", etiqueta: "comercial" },
      { [SCOPE_PARAM]: BOARD_SCOPES.mio },
    );

    expect(href.startsWith("/kanban?")).toBe(true);
    const params = new URLSearchParams(href.slice("/kanban?".length));
    expect(params.get("prioridad")).toBe("Alta");
    expect(params.get("etiqueta")).toBe("comercial");
    expect(params.get(SCOPE_PARAM)).toBe("mio");
  });

  it("replaces an existing scope rather than appending a second one", () => {
    const href = buildBoardHref(
      "/kanban",
      { scope: "mio" },
      { [SCOPE_PARAM]: BOARD_SCOPES.equipo },
    );

    const params = new URLSearchParams(href.slice("/kanban?".length));
    expect(params.getAll(SCOPE_PARAM)).toEqual(["equipo"]);
  });

  it("drops empty values instead of emitting bare params", () => {
    const href = buildBoardHref(
      "/kanban",
      { prioridad: "", etiqueta: undefined },
      { [SCOPE_PARAM]: BOARD_SCOPES.mio },
    );

    expect(href).toBe(`/kanban?${SCOPE_PARAM}=mio`);
  });
});

describe("parseBoardFilters (spec KV1 — every filter comes from the URL)", () => {
  it("reads all six filters plus the scope", () => {
    expect(
      parseBoardFilters({
        scope: "mio",
        responsable: "user-1",
        prioridad: "Alta",
        etiqueta: "comercial",
        cliente: "42",
        vencidas: "1",
        sinFecha: "1",
      }),
    ).toEqual({
      scope: BOARD_SCOPES.mio,
      responsableId: "user-1",
      prioridad: "Alta",
      etiqueta: "comercial",
      clienteId: 42,
      vencidas: true,
      sinFecha: true,
    });
  });

  it("defaults to no filter at all for an empty URL", () => {
    expect(parseBoardFilters({})).toEqual({
      scope: BOARD_SCOPES.equipo,
      responsableId: undefined,
      prioridad: undefined,
      etiqueta: undefined,
      clienteId: undefined,
      vencidas: false,
      sinFecha: false,
    });
  });

  it("treats blank values as absent, not as a filter for the empty string", () => {
    // `?prioridad=` is what a cleared <select> submits; filtering on "" would
    // match nothing and look like an empty board.
    const filters = parseBoardFilters({ prioridad: "", etiqueta: "" });
    expect(filters.prioridad).toBeUndefined();
    expect(filters.etiqueta).toBeUndefined();
  });

  it("ignores a non-numeric cliente instead of sending NaN to Postgres", () => {
    expect(parseBoardFilters({ cliente: "abc" }).clienteId).toBeUndefined();
    expect(parseBoardFilters({ cliente: "0" }).clienteId).toBeUndefined();
    expect(parseBoardFilters({ cliente: "-3" }).clienteId).toBeUndefined();
  });

  it("only reads the boolean flags as the exact opt-in value", () => {
    // Anything other than "1" is off, so a stale or hand-edited
    // `?vencidas=false` cannot silently mean true.
    expect(parseBoardFilters({ vencidas: "1" }).vencidas).toBe(true);
    expect(parseBoardFilters({ vencidas: "false" }).vencidas).toBe(false);
    expect(parseBoardFilters({ vencidas: "0" }).vencidas).toBe(false);
    expect(parseBoardFilters({ vencidas: "true" }).vencidas).toBe(false);
  });
});

describe("buildBoardHref (shared by the board and the list view)", () => {
  it("keeps the caller's base path, so the list view links stay in the list", () => {
    // KV1/KV2: both views carry the SAME filters. A single hardcoded /kanban
    // would bounce a filtering user out of the list on every change.
    expect(buildBoardHref("/kanban/lista", {}, { prioridad: "Alta" })).toBe(
      "/kanban/lista?prioridad=Alta",
    );
  });

  it("merges the patch over the current params", () => {
    const href = buildBoardHref(
      "/kanban",
      { scope: "mio", prioridad: "Baja" },
      { prioridad: "Alta" },
    );

    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("prioridad")).toBe("Alta");
    expect(params.get("scope")).toBe("mio");
  });

  it("removes a param the patch clears", () => {
    const href = buildBoardHref(
      "/kanban",
      { prioridad: "Alta", scope: "mio" },
      { prioridad: undefined },
    );

    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.has("prioridad")).toBe(false);
    expect(params.get("scope")).toBe("mio");
  });

  it("returns the bare path when nothing is left to encode", () => {
    expect(
      buildBoardHref(
        "/kanban",
        { prioridad: "Alta" },
        { prioridad: undefined },
      ),
    ).toBe("/kanban");
  });
});
