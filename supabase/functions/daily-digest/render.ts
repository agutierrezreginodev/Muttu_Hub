import { hrefFor, type VencimientoItem } from "../_shared/vencimiento.ts";
import type { DigestStrings } from "./strings.ts";

export interface RenderOptions {
  /** Absolute origin the links are built against, e.g. https://hub.example. */
  baseUrl: string;
  strings: DigestStrings;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Minimal HTML escaping — titles are user-authored free text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFecha(fechaLimite: string, strings: DigestStrings): string {
  const parsed = Date.parse(fechaLimite);
  return Number.isNaN(parsed)
    ? strings.sinFecha
    : new Date(parsed).toISOString().slice(0, 10);
}

/** Absolute URL for an item, reusing the SAME rule the bell's links use. */
function urlFor(item: VencimientoItem, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${hrefFor(item)}`;
}

/**
 * Render the digest email (slice 11a).
 *
 * PURE — takes items and options, returns strings. No clock, no client, no
 * environment access, so a test can assert the whole output from literals.
 *
 * Every user-visible word comes from `options.strings`. Nothing here is a
 * hardcoded literal, and that is mechanically provable rather than a promise:
 * the test renders with sentinel strings and asserts the output contains only
 * sentinels plus row data. The email links reuse `hrefFor` from the shared
 * module, so a digest link and a bell link for the same row cannot diverge.
 */
export function render(
  items: readonly VencimientoItem[],
  { baseUrl, strings }: RenderOptions,
): RenderedEmail {
  const vencidas = items.filter((item) => item.estado === "vencido");
  const vencePronto = items.filter((item) => item.estado === "vence_pronto");

  const subject =
    vencidas.length > 0 ? strings.subjectConVencidas : strings.subject;

  const textSection = (titulo: string, section: VencimientoItem[]) =>
    section.length === 0
      ? []
      : [
          `${titulo}:`,
          ...section.map(
            (item) =>
              `- ${item.titulo} (${formatFecha(item.fechaLimite, strings)}) ${urlFor(item, baseUrl)}`,
          ),
          "",
        ];

  const text = [
    strings.intro,
    "",
    ...textSection(strings.vencidasTitulo, vencidas),
    ...textSection(strings.venceProntoTitulo, vencePronto),
    strings.pie,
  ].join("\n");

  const htmlSection = (titulo: string, section: VencimientoItem[]) =>
    section.length === 0
      ? ""
      : `<h2>${escapeHtml(titulo)}</h2><ul>${section
          .map(
            (item) =>
              `<li><a href="${escapeHtml(urlFor(item, baseUrl))}">${escapeHtml(
                item.titulo,
              )}</a> — ${escapeHtml(formatFecha(item.fechaLimite, strings))}</li>`,
          )
          .join("")}</ul>`;

  const html = [
    `<p>${escapeHtml(strings.intro)}</p>`,
    htmlSection(strings.vencidasTitulo, vencidas),
    htmlSection(strings.venceProntoTitulo, vencePronto),
    `<p><a href="${escapeHtml(baseUrl)}">${escapeHtml(strings.abrir)}</a></p>`,
    `<p>${escapeHtml(strings.pie)}</p>`,
  ].join("");

  return { subject, html, text };
}
