/**
 * PURE, CLIENT-SAFE. Zero server-only imports — same hard constraint
 * `columnas.ts` documents, for the same bundling reason.
 *
 * Filter and scope transport (design D10, spec KV1/KV2): the URL,
 * server-rendered. Every filter here is therefore a QUERY, never a client-side
 * filter over an over-fetched set — so a narrowed view cannot leak the rows it
 * merely hides. Deep-linkable and back-button correct as a consequence.
 *
 * The board and the list view share this module ENTIRELY: KV1 requires both to
 * carry the same filters, so a divergence here would be a divergence in what
 * the two views mean.
 */

export const SCOPE_PARAM = "scope";

export const FILTER_PARAMS = {
  responsable: "responsable",
  prioridad: "prioridad",
  etiqueta: "etiqueta",
  cliente: "cliente",
  vencidas: "vencidas",
  sinFecha: "sinFecha",
} as const;

/** The only value that turns a boolean filter on. */
export const FLAG_ON = "1";

export const BOARD_SCOPES = {
  /** Only cards the current user is responsable for. */
  mio: "mio",
  /** Every card RLS lets the caller see. */
  equipo: "equipo",
} as const;

export type BoardScope = (typeof BOARD_SCOPES)[keyof typeof BOARD_SCOPES];

export type SearchParamsRecord = Record<string, string | undefined>;

/**
 * One offered cliente in the filter form. Lives here rather than in the query
 * module that produces it, so the filter UI can import it without reaching into
 * a server-only module.
 */
export interface ClienteOption {
  id: number;
  nombre: string;
}

export interface BoardFilterValues {
  scope: BoardScope;
  responsableId: string | undefined;
  prioridad: string | undefined;
  etiqueta: string | undefined;
  clienteId: number | undefined;
  vencidas: boolean;
  sinFecha: boolean;
}

/**
 * `equipo` is the default for an absent, empty or unrecognised value: a
 * malformed URL must not silently narrow what a user sees, which would look
 * like missing data rather than like a filter.
 */
export function parseScope(value: string | undefined): BoardScope {
  return value === BOARD_SCOPES.mio ? BOARD_SCOPES.mio : BOARD_SCOPES.equipo;
}

/** Blank is absent: `?prioridad=` is what a cleared select submits. */
function parseText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A cliente filter must be a positive integer or nothing. Passing a NaN or a
 * `0` through to PostgREST would either error or match no row while looking
 * like a legitimately empty result.
 */
function parseId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : undefined;
}

/** Only the exact opt-in value is on, so `?vencidas=false` cannot mean true. */
function parseFlag(value: string | undefined): boolean {
  return value === FLAG_ON;
}

export function parseBoardFilters(
  params: SearchParamsRecord,
): BoardFilterValues {
  return {
    scope: parseScope(params[SCOPE_PARAM]),
    responsableId: parseText(params[FILTER_PARAMS.responsable]),
    prioridad: parseText(params[FILTER_PARAMS.prioridad]),
    etiqueta: parseText(params[FILTER_PARAMS.etiqueta]),
    clienteId: parseId(params[FILTER_PARAMS.cliente]),
    vencidas: parseFlag(params[FILTER_PARAMS.vencidas]),
    sinFecha: parseFlag(params[FILTER_PARAMS.sinFecha]),
  };
}

/**
 * Builds a view href from the CURRENT params plus a patch, preserving every
 * param the patch does not mention and dropping the ones it clears.
 *
 * `basePath` is a parameter rather than a constant because the board and the
 * list view carry identical filters (KV1): a hardcoded `/kanban` would bounce a
 * filtering user out of the list view on every single change.
 */
export function buildBoardHref(
  basePath: string,
  params: SearchParamsRecord,
  patch: SearchParamsRecord = {},
): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    if (value !== undefined && value !== "") {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}
