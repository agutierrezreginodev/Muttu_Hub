/**
 * Canonical due-date model — the ONE definition of "vencido" and "vence
 * pronto" (kanban slice 10, spec VM1, design part 3 §9).
 *
 * Three consumers read this file: the board badge, the notification bell, and
 * the daily digest Edge Function. They must partition the same rows the same
 * way, so the rule lives here once instead of three times.
 *
 * HARD CONSTRAINT — this file has ZERO imports and must keep them.
 * Deno resolves imports with an explicit `.ts` extension; Next/tsc resolves
 * them extensionless. A single import here would therefore have to be written
 * two mutually exclusive ways, and one of the two consumers would break. The
 * file is also deliberately free of Deno and Node globals for the same reason.
 */

/** How far ahead "vence pronto" reaches. */
export const VENTANA_VENCIMIENTO_HORAS = 72;

/**
 * The only estados an alert may fire for.
 *
 * `borrador` is absent ON PURPOSE and it is the whole reason `classify` does
 * not read `v_tarea.vencido`: that column is
 * `fecha_limite < now() and estado not in ('cumplido','cancelado')`, which is
 * TRUE for a past-due `borrador`. A borrador has no responsable yet, so
 * alerting on it would be nagging someone about a row nobody owns.
 */
export const ESTADOS_ACTIVOS = ["pendiente", "en_curso"] as const;

/** Local hour the daily digest fires. */
export const DIGEST_HORA_BOGOTA = 7;

export const ZONA_HORARIA = "America/Bogota";

export type VencimientoEstado = "vencido" | "vence_pronto";

export interface VencimientoItem {
  id: number;
  titulo: string;
  fechaLimite: string;
  estado: VencimientoEstado;
  origen: string;
  clienteId: number | null;
}

/** The row shape `classify` needs — a structural subset of `v_tarea`. */
export interface VencimientoRow {
  estado: string;
  fechaLimite: string | null;
}

export function esEstadoActivo(estado: string): boolean {
  return (ESTADOS_ACTIVOS as readonly string[]).includes(estado);
}

/** The far edge of the "vence pronto" window: `now` + 72h. */
export function horizonFrom(now: Date): Date {
  return new Date(now.getTime() + VENTANA_VENCIMIENTO_HORAS * 60 * 60 * 1000);
}

/**
 * Which alert bucket a row falls in, or `null` for no alert at all.
 *
 * **Correction C10 — structural.** The `estado` gate comes FIRST and is
 * explicit, and `v_tarea.vencido` is never read here. Deriving the answer from
 * that column would silently alert on past-due `borrador` rows, which is the
 * exact regression VM1 guards against.
 *
 * Boundaries match the view's own `vencido` expression so the three consumers
 * agree: strictly past `now` is `vencido`; exactly `now` is not yet overdue;
 * the 72h horizon is inclusive.
 */
export function classify(row: VencimientoRow, now: Date): VencimientoEstado | null {
  if (!esEstadoActivo(row.estado)) {
    return null;
  }

  if (row.fechaLimite === null) {
    return null;
  }

  const limite = Date.parse(row.fechaLimite);
  if (Number.isNaN(limite)) {
    return null;
  }

  if (limite < now.getTime()) {
    return "vencido";
  }

  if (limite <= horizonFrom(now).getTime()) {
    return "vence_pronto";
  }

  return null;
}

/**
 * The Bogota calendar day an instant belongs to, as `YYYY-MM-DD`.
 *
 * `digest_envio`'s uniqueness is per Bogota day, not per UTC timestamp, so
 * "once a day" has to survive the fact that the 12:00 UTC fire hour and the
 * UTC date boundary are five hours apart. Computed through `Intl` rather than
 * a hardcoded -5: the offset is stated once, by the platform, in a form that
 * stays correct if Colombia ever adopts DST — and the UTC-midnight test would
 * fail loudly rather than silently drift if the runtime lacked the timezone.
 */
/**
 * Where an alert takes the reader (NB4, N5 closed).
 *
 * Lives here rather than in `src/` because it has TWO consumers that must
 * agree: the bell's links and the digest email's links. The Edge Function
 * cannot import from `src/`, so leaving this on the app side would mean
 * writing the rule twice — the exact duplication this module exists to
 * prevent, and the kind that diverges silently because nothing renders both
 * side by side.
 *
 * A CRM-side row goes to the client's Compromisos tab, where its context is:
 * the cliente, the sibling compromisos, the bitácora. `'Ambos'` counts as
 * CRM — a promoted compromiso exists in both places, and the CRM side is the
 * one that explains why the task exists. A board-only row, or a CRM row with
 * no cliente to land on, goes to the tarea detail.
 */
export function hrefFor(
  item: { id: number; origen: string; clienteId: number | null },
): string {
  const esCrm = item.origen === "CRM" || item.origen === "Ambos";

  if (esCrm && item.clienteId !== null) {
    return `/crm/${item.clienteId}/compromisos`;
  }

  return `/kanban/${item.id}`;
}

export function fechaEnvioBogota(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}
