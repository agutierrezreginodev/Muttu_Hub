/**
 * Board reports (slice 8, spec KR1, design D8).
 *
 * PURE and dependency-free on purpose. Every figure is derived from the rows
 * the board already fetched, so a report can never disagree with the board it
 * claims to summarise. No SQL aggregation, no new view, no new database
 * object: an aggregate query would run under its own RLS evaluation and become
 * a second, silently divergent answer to "what can this user see?".
 */

/** Bucket for rows with no responsable — see `buildReporte`'s sum invariant. */
export const SIN_RESPONSABLE = "__sin_responsable__";

/** Bucket for rows with no prioridad — same reason. */
export const SIN_PRIORIDAD = "__sin_prioridad__";

/**
 * The structural subset of a board row a report needs. Deliberately narrower
 * than `BoardTarea`: this module stays pure and independent of the query
 * layer's shape, and a caller passing board rows satisfies it structurally.
 */
export interface ReporteRow {
  responsableId: string | null;
  estado: string;
  prioridad: string | null;
  etiquetas: string[];
  /** Read from `v_tarea.vencido` (KB4) — never recomputed from a date here. */
  vencido: boolean;
}

export interface DistribucionItem {
  clave: string;
  total: number;
}

export interface ReporteTablero {
  total: number;
  vencidas: number;
  porResponsable: DistribucionItem[];
  porEstado: DistribucionItem[];
  porEtiqueta: DistribucionItem[];
  porPrioridad: DistribucionItem[];
}

/**
 * Count descending, then key ascending.
 *
 * The second key is what makes the output deterministic. Ordering by count
 * alone leaves ties in whatever order Postgres happened to return the rows,
 * so a report would reshuffle between loads with no data change behind it.
 */
function toSortedDistribucion(counts: Map<string, number>): DistribucionItem[] {
  return [...counts.entries()]
    .map(([clave, total]) => ({ clave, total }))
    .sort((a, b) => b.total - a.total || a.clave.localeCompare(b.clave));
}

function increment(counts: Map<string, number>, clave: string): void {
  counts.set(clave, (counts.get(clave) ?? 0) + 1);
}

export function buildReporte(rows: readonly ReporteRow[]): ReporteTablero {
  const porResponsable = new Map<string, number>();
  const porEstado = new Map<string, number>();
  const porEtiqueta = new Map<string, number>();
  const porPrioridad = new Map<string, number>();
  let vencidas = 0;

  for (const row of rows) {
    if (row.vencido) {
      vencidas += 1;
    }

    increment(porResponsable, row.responsableId ?? SIN_RESPONSABLE);
    increment(porEstado, row.estado);
    increment(porPrioridad, row.prioridad ?? SIN_PRIORIDAD);

    // Multi-valued, so this distribution alone cannot sum to `total`: a
    // two-tag row counts twice and an untagged row counts nowhere. That is
    // why there is no `SIN_ETIQUETA` sentinel — it would imply an invariant
    // the data cannot support.
    for (const etiqueta of row.etiquetas) {
      increment(porEtiqueta, etiqueta);
    }
  }

  return {
    total: rows.length,
    vencidas,
    porResponsable: toSortedDistribucion(porResponsable),
    porEstado: toSortedDistribucion(porEstado),
    porEtiqueta: toSortedDistribucion(porEtiqueta),
    porPrioridad: toSortedDistribucion(porPrioridad),
  };
}
