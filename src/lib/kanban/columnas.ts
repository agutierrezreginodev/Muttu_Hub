/**
 * PURE, CLIENT-SAFE. ZERO server-only imports, by hard constraint.
 *
 * `src/lib/crm/catalogo-options.ts` documents a real bug this codebase
 * already paid for: `"use client"` components (`tarea-card.tsx`,
 * `mover-a-menu.tsx`, both landing in later slices) import
 * `TERMINAL_COLUMNA_ESTADO` / `resolveEstadoOnMove` (slice 5b) directly from
 * this file. If this module ever gains an import of a module that itself
 * imports `@/lib/supabase/server` (which uses `next/headers`), that entire
 * chain gets pulled into the client bundle and Next.js rejects the build.
 * Any future edit to this file MUST NOT add such an import — client
 * components must import from THIS file directly, never through a barrel
 * that also re-exports server code.
 *
 * `resolveEstadoOnMove` (design part 1 §6's 9-row truth table) is deferred
 * to slice 5b, once `moveTareaAction` exists to consume it — this slice only
 * scaffolds the pure helpers `moveTareaAction` will not itself need until
 * then: the catalog tipo constants, the terminal-column map, and the two
 * board-render helpers (`fallbackColumna`, `groupTareasByColumna`).
 */

export const COLUMNA_TIPO = "columna_tablero" as const;
export const ETIQUETA_TIPO = "etiqueta_tarea" as const;
/**
 * Catalog `tipo` behind `tarea.prioridad`. Duplicated from CRM rather than
 * imported, for the same module-independence reason `schemas.ts` duplicates
 * `optionalTrimmed`: the shared value is the DB's, not one module's to own.
 */
export const PRIORIDAD_TIPO = "prioridad" as const;

/**
 * One offered option of a catalog-backed picker (prioridad, etiquetas). Lives in
 * THIS pure module, not in `queries.ts` which produces it: `queries.ts` imports
 * `createClient` (server-only, `next/headers`), and the tarea form is a
 * `"use client"` component — the same split `catalogo-options.ts` and
 * `directory-options.ts` document, for the same bug.
 */
export interface CatalogoPickerOption {
  codigo: string;
  etiqueta: string;
}

/**
 * Reserved terminal column codes -> the `tarea.estado` they own (design D1,
 * D5). The ONLY place this mapping exists. `codigo` is absent from
 * `catalogo`'s UPDATE grant (`crm_catalogos.sql:82`), so an admin renaming a
 * column's `etiqueta` can never break this map — it keys on `codigo`, never
 * on the (renamable) display label.
 */
export const TERMINAL_COLUMNA_ESTADO = {
  cumplido: "cumplido",
  cancelado: "cancelado",
} as const;

export const REOPEN_ESTADO = "en_curso" as const;

export type TerminalColumnaCodigo = keyof typeof TERMINAL_COLUMNA_ESTADO;

export function isTerminalColumna(
  codigo: string | null,
): codigo is TerminalColumnaCodigo {
  return codigo !== null && codigo in TERMINAL_COLUMNA_ESTADO;
}

interface ColumnaActiva {
  codigo: string;
}

/**
 * Spec KC3 / design D3: a `tarea` with `columna is null` renders in the
 * lowest-`orden` ACTIVE column. Callers pass columns already ordered by
 * `orden` (as `v_catalogo` itself returns them), so "first" here means
 * exactly that — this function does no sorting of its own.
 */
export function fallbackColumna(
  columnasActivas: ColumnaActiva[],
): string | null {
  return columnasActivas[0]?.codigo ?? null;
}

interface TareaConColumna {
  id: number;
  columna: string | null;
}

/**
 * Groups tareas by their `columna` for the board render (design part 2 §12,
 * deferred to slice 4b's actual page — scaffolded here as a pure sibling of
 * `fallbackColumna`). Guarantees:
 *  - every ACTIVE column gets a bucket, even an empty one (so an empty
 *    column still renders its header + empty state, per KB1);
 *  - a `null` columna and the literal codigo of the fallback column land in
 *    the SAME bucket (design D3's stated tradeoff: "any predicate meaning
 *    'cards in the first column' must be `columna is null or columna =
 *    <first>`" — this function IS that predicate, applied once, here);
 *  - a tarea whose stored `columna` references a DEACTIVATED or otherwise
 *    unknown code (not present in `columnasActivas`) still renders, folded
 *    into the fallback bucket — a card is never silently dropped from the
 *    board because an admin later deactivated the column it was sitting in.
 */
export function groupTareasByColumna<T extends TareaConColumna>(
  tareas: T[],
  columnasActivas: ColumnaActiva[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const columna of columnasActivas) {
    groups.set(columna.codigo, []);
  }

  const fallback = fallbackColumna(columnasActivas);

  for (const tarea of tareas) {
    const targetCodigo = tarea.columna ?? fallback;
    const bucket =
      (targetCodigo !== null ? groups.get(targetCodigo) : undefined) ??
      (fallback !== null ? groups.get(fallback) : undefined);
    bucket?.push(tarea);
  }

  return groups;
}

/**
 * `prioridad`'s exact seeded `orden` (design part 2 §12's ranking; catalog
 * seed at supabase/migrations/20260728182944_crm_catalogos.sql:118-120).
 * This is data-shaped, not schema-shaped: `codigo` is immutable, but a
 * catalog is otherwise app-layer content, so this map is a deliberate,
 * documented coupling to the SEED VALUES ONLY — an admin cannot rename
 * `prioridad` codes (`codigo` is absent from the UPDATE grant) so this
 * cannot silently drift.
 */
const PRIORIDAD_ORDEN: Record<string, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

interface TareaOrdenable {
  fechaLimite: string | null;
  prioridad: string | null;
  createdAt: string;
}

function fechaRank(fechaLimite: string | null): number {
  // Number.MAX_SAFE_INTEGER, NOT Number.POSITIVE_INFINITY: two "sin fecha"
  // cards must compare as a genuine tie (rank - rank === 0) so the
  // prioridad/createdAt tie-breaks below actually run. Infinity - Infinity
  // is NaN, which Array.prototype.sort silently treats as "no swap" —
  // exactly the bug this comment prevents a future edit from reintroducing.
  return fechaLimite
    ? new Date(fechaLimite).getTime()
    : Number.MAX_SAFE_INTEGER;
}

function prioridadRank(prioridad: string | null): number {
  if (prioridad === null) {
    return Number.MAX_SAFE_INTEGER;
  }
  return PRIORIDAD_ORDEN[prioridad] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Card order within a column (design part 2 §12): `fecha_limite` asc (nulls
 * LAST) -> `prioridad` (Alta, Media, Baja) -> `created_at` asc. Pure, so no
 * query/mock is needed to exercise it — v1 has no manual reorder
 * (`posicion` column), so this predicate alone decides a column's card
 * order. Returns a NEW array; the input is never mutated (callers may reuse
 * the same `groupTareasByColumna` bucket for re-renders).
 */
export function sortTareasForBoard<T extends TareaOrdenable>(tareas: T[]): T[] {
  return [...tareas].sort((a, b) => {
    const fechaDiff = fechaRank(a.fechaLimite) - fechaRank(b.fechaLimite);
    if (fechaDiff !== 0) {
      return fechaDiff;
    }

    const prioridadDiff =
      prioridadRank(a.prioridad) - prioridadRank(b.prioridad);
    if (prioridadDiff !== 0) {
      return prioridadDiff;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
