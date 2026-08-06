/**
 * Every user-visible string the digest email can contain (slice 11a).
 *
 * Function-local on purpose. The app's `src/messages/es.ts` is on the other
 * side of the Deno/Next boundary and the Edge Function cannot import it —
 * so rather than reaching across and breaking the runtime, the email owns its
 * own copy. The duplication is real and accepted: these strings are an email's
 * voice, not the app's UI, and they change on a different schedule.
 *
 * Frozen so a caller cannot mutate the shared copy between recipients in the
 * per-recipient loop.
 */
export const STRINGS = Object.freeze({
  subject: "Tu resumen diario · Muttu Hub",
  subjectConVencidas: "Tenés tareas vencidas · Muttu Hub",
  intro: "Esto es lo que tenés vencido o por vencer en los próximos tres días.",
  vencidasTitulo: "Vencidas",
  venceProntoTitulo: "Vencen pronto",
  sinFecha: "Sin fecha",
  abrir: "Abrir en Muttu Hub",
  pie: "Recibís este correo porque tenés activo el resumen diario. Podés desactivarlo en Preferencias.",
});

export type DigestStrings = typeof STRINGS;
