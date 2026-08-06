import { describe, expect, it } from "vitest";

import { render } from "./render.ts";
import { STRINGS, type DigestStrings } from "./strings.ts";
import type { VencimientoItem } from "../_shared/vencimiento.ts";

const BASE_URL = "https://hub.example";

function item(overrides: Partial<VencimientoItem> = {}): VencimientoItem {
  return {
    id: 7,
    titulo: "Enviar propuesta",
    fechaLimite: "2026-08-05T12:00:00.000Z",
    estado: "vencido",
    origen: "Kanban",
    clienteId: null,
    ...overrides,
  };
}

/** Every string replaced by a traceable sentinel. */
const SENTINELS: DigestStrings = Object.freeze({
  subject: "S_SUBJECT",
  subjectConVencidas: "S_SUBJECT_VENCIDAS",
  intro: "S_INTRO",
  vencidasTitulo: "S_VENCIDAS",
  venceProntoTitulo: "S_PRONTO",
  sinFecha: "S_SIN_FECHA",
  abrir: "S_ABRIR",
  pie: "S_PIE",
});

describe("render (slice 11a)", () => {
  it("builds absolute links with the SAME rule the bell uses", () => {
    const { html, text } = render(
      [
        item({ id: 7, origen: "Kanban", clienteId: null }),
        item({
          id: 8,
          origen: "Ambos",
          clienteId: 42,
          titulo: "Compromiso",
          fechaLimite: "2026-08-06T12:00:00.000Z",
        }),
      ],
      { baseUrl: BASE_URL, strings: STRINGS },
    );

    expect(html).toContain("https://hub.example/kanban/7");
    expect(html).toContain("https://hub.example/crm/42/compromisos");
    expect(text).toContain("https://hub.example/kanban/7");
  });

  it("does not double the slash when baseUrl has a trailing one", () => {
    const { html } = render([item()], {
      baseUrl: "https://hub.example/",
      strings: STRINGS,
    });

    expect(html).toContain("https://hub.example/kanban/7");
    expect(html).not.toContain("hub.example//kanban");
  });

  it("says so in the subject when something is already overdue", () => {
    expect(
      render([item({ estado: "vencido" })], {
        baseUrl: BASE_URL,
        strings: STRINGS,
      }).subject,
    ).toBe(STRINGS.subjectConVencidas);

    expect(
      render([item({ estado: "vence_pronto" })], {
        baseUrl: BASE_URL,
        strings: STRINGS,
      }).subject,
    ).toBe(STRINGS.subject);
  });

  it("separates the overdue and due-soon sections", () => {
    const { text } = render(
      [
        item({ id: 1, estado: "vencido", titulo: "Ya vencida" }),
        item({ id: 2, estado: "vence_pronto", titulo: "Vence pronto" }),
      ],
      { baseUrl: BASE_URL, strings: STRINGS },
    );

    expect(text).toContain(`${STRINGS.vencidasTitulo}:`);
    expect(text).toContain(`${STRINGS.venceProntoTitulo}:`);
  });

  it("omits a section that has no rows rather than printing an empty heading", () => {
    const { text, html } = render([item({ estado: "vencido" })], {
      baseUrl: BASE_URL,
      strings: STRINGS,
    });

    expect(text).not.toContain(`${STRINGS.venceProntoTitulo}:`);
    expect(html).not.toContain(`<h2>${STRINGS.venceProntoTitulo}</h2>`);
  });

  it("escapes a title that contains HTML", () => {
    const { html } = render(
      [item({ titulo: '<img src=x onerror="alert(1)">' })],
      { baseUrl: BASE_URL, strings: STRINGS },
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("MECHANICAL PROOF: emits no user-visible string that is not a sentinel", () => {
    // Replaces the untestable "no hardcoded literals" wording. Render with
    // sentinels, then strip every sentinel, every row datum and all markup —
    // whatever prose is left behind is a literal someone hardcoded.
    const { subject, html, text } = render(
      [
        item({ id: 7, titulo: "TITULO_A", estado: "vencido" }),
        item({
          id: 8,
          titulo: "TITULO_B",
          estado: "vence_pronto",
          fechaLimite: "2026-08-08T12:00:00.000Z",
        }),
      ],
      { baseUrl: BASE_URL, strings: SENTINELS },
    );

    const known = [
      ...Object.values(SENTINELS),
      "TITULO_A",
      "TITULO_B",
      "2026-08-05",
      "2026-08-08",
      BASE_URL,
      "/kanban/7",
      "/kanban/8",
    ];

    let residue = `${subject}\n${text}\n${html}`;
    // Longest first: stripping "S_SUBJECT" before "S_SUBJECT_VENCIDAS" would
    // chew the prefix off the longer sentinel and leave its tail behind as
    // fake residue.
    for (const value of [...known].sort((a, b) => b.length - a.length)) {
      residue = residue.split(value).join("");
    }
    // Strip tags, entities, punctuation and whitespace; letters that survive
    // are prose nobody routed through `strings.ts`.
    residue = residue
      .replace(/<[^>]*>/g, "")
      .replace(/&[a-z]+;/g, "")
      .replace(/[^\p{L}]/gu, "");

    expect(residue).toBe("");
  });

  it("renders an empty item list without throwing", () => {
    const { subject, text } = render([], {
      baseUrl: BASE_URL,
      strings: STRINGS,
    });

    // index.ts suppresses empty digests before reaching here; this only
    // guarantees render() is total rather than relying on that ordering.
    expect(subject).toBe(STRINGS.subject);
    expect(text).toContain(STRINGS.pie);
  });
});
