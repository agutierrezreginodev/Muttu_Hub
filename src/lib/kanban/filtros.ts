/**
 * PURE, CLIENT-SAFE. Zero server-only imports — same hard constraint
 * `columnas.ts` documents, for the same bundling reason.
 *
 * Board scope transport (design D10): the URL, server-rendered. "Mi tablero" is
 * therefore a QUERY, never a client-side filter over an over-fetched set — so
 * it cannot leak rows it merely hides.
 */

export const SCOPE_PARAM = "scope";

export const BOARD_SCOPES = {
  /** Only cards the current user is responsable for. */
  mio: "mio",
  /** Every card RLS lets the caller see. */
  equipo: "equipo",
} as const;

export type BoardScope = (typeof BOARD_SCOPES)[keyof typeof BOARD_SCOPES];

/**
 * `equipo` is the default for an absent, empty or unrecognised value: a
 * malformed URL must not silently narrow what a user sees, which would look
 * like missing data rather than like a filter.
 */
export function parseScope(value: string | undefined): BoardScope {
  return value === BOARD_SCOPES.mio ? BOARD_SCOPES.mio : BOARD_SCOPES.equipo;
}

/**
 * Builds the board href for a scope while PRESERVING every other search param.
 * Slice 6 adds real filter params to this same URL; dropping them here would
 * silently reset a user's filters every time they flipped the scope.
 *
 * `equipo` is written as an explicit param rather than omitted, so the URL says
 * what it means and a shared link cannot be reinterpreted by a future default.
 */
export function buildScopeHref(
  params: Record<string, string | undefined>,
  scope: BoardScope,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== SCOPE_PARAM && value !== undefined && value !== "") {
      next.set(key, value);
    }
  }
  next.set(SCOPE_PARAM, scope);
  return `/kanban?${next.toString()}`;
}
