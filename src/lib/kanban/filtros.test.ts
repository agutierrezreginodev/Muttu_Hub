import { describe, expect, it } from "vitest";

import {
  BOARD_SCOPES,
  SCOPE_PARAM,
  buildScopeHref,
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

describe("buildScopeHref", () => {
  it("sets the scope param", () => {
    expect(buildScopeHref({}, BOARD_SCOPES.mio)).toBe(
      `/kanban?${SCOPE_PARAM}=mio`,
    );
  });

  it("writes the team scope explicitly instead of omitting it", () => {
    // A shared link should keep meaning what it meant, even if the default
    // changes later.
    expect(buildScopeHref({}, BOARD_SCOPES.equipo)).toBe(
      `/kanban?${SCOPE_PARAM}=equipo`,
    );
  });

  it("preserves the other search params", () => {
    // Slice 6 puts real filters on this same URL. Dropping them here would
    // reset a user's filters every time they flipped the scope.
    const href = buildScopeHref(
      { prioridad: "Alta", etiqueta: "comercial" },
      BOARD_SCOPES.mio,
    );

    expect(href.startsWith("/kanban?")).toBe(true);
    const params = new URLSearchParams(href.slice("/kanban?".length));
    expect(params.get("prioridad")).toBe("Alta");
    expect(params.get("etiqueta")).toBe("comercial");
    expect(params.get(SCOPE_PARAM)).toBe("mio");
  });

  it("replaces an existing scope rather than appending a second one", () => {
    const href = buildScopeHref({ scope: "mio" }, BOARD_SCOPES.equipo);

    const params = new URLSearchParams(href.slice("/kanban?".length));
    expect(params.getAll(SCOPE_PARAM)).toEqual(["equipo"]);
  });

  it("drops empty values instead of emitting bare params", () => {
    const href = buildScopeHref(
      { prioridad: "", etiqueta: undefined },
      BOARD_SCOPES.mio,
    );

    expect(href).toBe(`/kanban?${SCOPE_PARAM}=mio`);
  });
});
