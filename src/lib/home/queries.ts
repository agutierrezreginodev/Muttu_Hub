import { createClient } from "@/lib/supabase/server";
import { TERMINAL_COLUMNA_ESTADO } from "@/lib/kanban/columnas";

/**
 * Home page KPI grid: five COUNT queries over the same RLS-gated views every
 * other module reads (`v_cliente`, `v_oportunidad`, `v_tarea`, `v_documento`)
 * via the shared supabase server client — Postgres RLS stays the security
 * boundary (design decision "Security boundary"), so each count reflects only
 * what the caller's role can see, same convention as `listClientes` /
 * `listBoardTareas`.
 *
 * Demo-critical page, so degradation is PER KPI, never whole-page: each query
 * runs through `Promise.allSettled` and `assembleHomeKpis` maps an errored or
 * rejected outcome to `null`, which the page renders as "—". A broken KPI
 * never crashes the page nor blanks the other four.
 */

/**
 * `estado_cliente` code for an active cliente (catalog seed:
 * supabase/migrations/20260728182944_crm_catalogos.sql — 'activo'). `codigo`
 * is immutable (absent from catalogo's UPDATE grant), so keying on the code,
 * never on the renamable etiqueta 'Activo', cannot silently drift — the same
 * convention TERMINAL_COLUMNA_ESTADO documents.
 */
export const ESTADO_CLIENTE_ACTIVO = "activo" as const;

/**
 * CLOSED oportunidad states (catalog seed: `estado_oportunidad` codes
 * 'ganada'/'perdida' — won/lost). "Abiertas" is defined by EXCLUSION, not by
 * enumerating today's open codes ('abierta', 'en_curso'): a future open state
 * added to the catalog then counts automatically, with no code change here.
 */
export const OPORTUNIDAD_CERRADA_ESTADOS = ["ganada", "perdida"] as const;

/**
 * "Done" tarea states. The ONLY source of truth is TERMINAL_COLUMNA_ESTADO
 * (`src/lib/kanban/columnas.ts`) — the same pair v_tarea.vencido's SQL mirrors
 * verbatim (`estado not in ('cumplido','cancelado')`,
 * supabase/migrations/20260803150000_kanban_columna.sql). "Pendientes" is
 * defined by exclusion, the same tradeoff as OPORTUNIDAD_CERRADA_ESTADOS.
 */
export const TAREA_DONE_ESTADOS: readonly string[] = Object.values(
  TERMINAL_COLUMNA_ESTADO,
);

/** Raw outcome of one KPI count query — mirrors supabase-js `{ count, error }`. */
export interface KpiCountOutcome {
  count: number | null;
  error: unknown;
}

export interface HomeKpiOutcomes {
  clientesActivos: KpiCountOutcome;
  oportunidadesAbiertas: KpiCountOutcome;
  tareasPendientes: KpiCountOutcome;
  tareasVencidas: KpiCountOutcome;
  documentos: KpiCountOutcome;
}

/** Every KPI value: a real count, or `null` when its query failed. */
export interface HomeKpis {
  clientesActivos: number | null;
  oportunidadesAbiertas: number | null;
  tareasPendientes: number | null;
  tareasVencidas: number | null;
  documentos: number | null;
}

function toKpiValue(outcome: KpiCountOutcome): number | null {
  if (outcome.error !== null && outcome.error !== undefined) {
    return null;
  }
  // A succeeded query reports a null count only in theory (head:true always
  // fills count on success); treat it as "no rows", NOT as a failure — `null`
  // means "query failed" exclusively, so the "—" fallback never lies.
  return outcome.count ?? 0;
}

/**
 * PURE assembly — the page's per-KPI fallback rule, extracted so the unit
 * test exercises it without mocking supabase (`src/lib/kanban/columnas.ts`
 * sets the same pure/server split precedent).
 */
export function assembleHomeKpis(outcomes: HomeKpiOutcomes): HomeKpis {
  return {
    clientesActivos: toKpiValue(outcomes.clientesActivos),
    oportunidadesAbiertas: toKpiValue(outcomes.oportunidadesAbiertas),
    tareasPendientes: toKpiValue(outcomes.tareasPendientes),
    tareasVencidas: toKpiValue(outcomes.tareasVencidas),
    documentos: toKpiValue(outcomes.documentos),
  };
}

/** PostgREST in-list literal: `("a","b")` — quoted so any future code survives. */
function inFilterList(values: readonly string[]): string {
  return `(${values.map((value) => `"${value}"`).join(",")})`;
}

function toOutcome(
  settled: PromiseSettledResult<{
    count: number | null;
    error: unknown;
  }>,
): KpiCountOutcome {
  return settled.status === "fulfilled"
    ? { count: settled.value.count, error: settled.value.error }
    : { count: null, error: settled.reason };
}

export async function getHomeKpis(): Promise<HomeKpis> {
  const supabase = await createClient();
  const headCount = { count: "exact", head: true } as const;

  const [clientes, oportunidades, pendientes, vencidas, documentos] =
    await Promise.allSettled([
      supabase
        .from("v_cliente")
        .select("*", headCount)
        .eq("estado", ESTADO_CLIENTE_ACTIVO),
      supabase
        .from("v_oportunidad")
        .select("*", headCount)
        .not("estado", "in", inFilterList(OPORTUNIDAD_CERRADA_ESTADOS)),
      supabase
        .from("v_tarea")
        .select("*", headCount)
        .not("estado", "in", inFilterList(TAREA_DONE_ESTADOS)),
      supabase.from("v_tarea").select("*", headCount).eq("vencido", true),
      supabase.from("v_documento").select("*", headCount),
    ]);

  return assembleHomeKpis({
    clientesActivos: toOutcome(clientes),
    oportunidadesAbiertas: toOutcome(oportunidades),
    tareasPendientes: toOutcome(pendientes),
    tareasVencidas: toOutcome(vencidas),
    documentos: toOutcome(documentos),
  });
}
