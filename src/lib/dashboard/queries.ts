import { createClient } from "@/lib/supabase/server";
import { getCatalogoOptions } from "@/lib/crm/catalogos";

/**
 * Pipeline face query helpers (task 2.4, design.md §4.1, spec
 * dashboard-pipeline). All three read the `security_invoker` aggregation
 * views from `dashboard_pipeline_views` migration — RLS
 * (`oportunidad_select` / `oportunidad_servicio_select` -> `crm.ver`) is
 * inherited from those views, never re-checked here. A caller who lacks
 * `crm.ver` gets the zero/empty shape from every helper below, same
 * "ignore error, default to zeros/[]" convention `src/lib/crm/queries.ts`
 * already uses — never a thrown error.
 */

export interface PipelineEstadoRow {
  estado: string;
  oportunidades: number;
  valorTotal: number;
}

export interface PipelineTotales {
  abiertas: number;
  valorAbiertas: number;
  total: number;
  /**
   * Conversion needs an owner-confirmed won/lost `estado_oportunidad`
   * classification that does not exist yet (proposal.md Open Question 1,
   * design.md §4.1). CONFIRMED PRODUCT DECISION: ship WITHOUT a conversion
   * metric/tile in this PR. This flag is exposed only so a future PR can
   * consume it once the classification is confirmed — the query layer
   * never guesses at won/lost estado codes.
   */
  pendingClassification: true;
}

export interface PipelineServicioRow {
  servicioCodigo: string;
  oportunidades: number;
}

/** Sentinel `servicioCodigo` for the folded "9th+ never a new hue" bucket (design.md §5). */
export const OTROS_SERVICIO_CODE = "__otros__";

const SERVICIO_TOP_N = 8;

/**
 * Orders Pipeline-by-estado rows by the `estado_oportunidad` catalog's
 * `orden` (spec "Oportunidades by estado (count) chart"), falling back to
 * descending count for any estado code the catalog map doesn't carry an
 * order for — never dropped, just pushed after every ordered code. Pure
 * function, independently unit-testable without a DB (task 2.3).
 */
export function sortPipelineEstadoRows(
  rows: PipelineEstadoRow[],
  estadoOrder: ReadonlyMap<string, number>,
): PipelineEstadoRow[] {
  return [...rows].sort((a, b) => {
    const orderA = estadoOrder.get(a.estado);
    const orderB = estadoOrder.get(b.estado);
    if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
    if (orderA !== undefined) return -1;
    if (orderB !== undefined) return 1;
    return b.oportunidades - a.oportunidades;
  });
}

/**
 * Folds every servicio row beyond the top N (by count) into a single
 * "Otros" bucket (spec "Servicios de interés distribution", design.md §5
 * "9th+ never a new hue"). Pure function, independently unit-testable
 * without a DB (task 2.3).
 */
export function topNServicioWithOtros(
  rows: PipelineServicioRow[],
  topN: number = SERVICIO_TOP_N,
): PipelineServicioRow[] {
  const sorted = [...rows].sort((a, b) => b.oportunidades - a.oportunidades);
  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otrosTotal = rest.reduce((sum, row) => sum + row.oportunidades, 0);

  return [
    ...top,
    { servicioCodigo: OTROS_SERVICIO_CODE, oportunidades: otrosTotal },
  ];
}

/**
 * Oportunidades count + value by estado (task 2.4). Defaults to `[]` on no
 * data/error — never throws to the caller. Ordered by the
 * `estado_oportunidad` catalog's `orden`.
 */
export async function getPipelineEstado(): Promise<PipelineEstadoRow[]> {
  const supabase = await createClient();
  const [{ data }, catalogoMap] = await Promise.all([
    supabase
      .from("v_dashboard_pipeline_estado")
      .select("estado, oportunidades, valor_total"),
    getCatalogoOptions(),
  ]);

  const rows: PipelineEstadoRow[] = (data ?? []).map((row) => ({
    estado: row.estado,
    oportunidades: row.oportunidades,
    valorTotal: row.valor_total,
  }));

  const estadoOrder = new Map(
    (catalogoMap.get("estado_oportunidad") ?? []).map((option) => [
      option.codigo,
      option.orden,
    ]),
  );

  return sortPipelineEstadoRows(rows, estadoOrder);
}

/**
 * Headline totals: open count, open value, grand total (task 2.4). This
 * view has NO `group by` (a single scalar row, design.md §4.1), so it
 * always returns exactly one row even when the caller's RLS excludes every
 * underlying oportunidad — that row's aggregates are simply all zero. This
 * helper still defaults to zeros if `data` is somehow null (network/error
 * edge case), never throwing.
 */
export async function getPipelineTotales(): Promise<PipelineTotales> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_pipeline_totales")
    .select("abiertas, valor_abiertas, total")
    .maybeSingle();

  return {
    abiertas: data?.abiertas ?? 0,
    valorAbiertas: data?.valor_abiertas ?? 0,
    total: data?.total ?? 0,
    pendingClassification: true,
  };
}

/**
 * Oportunidad count per `servicio_interes` code (task 2.4, spec "Servicios
 * de interés distribution", optional secondary chart). Defaults to `[]` on
 * no data/error. Top-N + Otros folding is the caller's responsibility via
 * `topNServicioWithOtros` (kept separate so a future "show all" toggle can
 * skip the fold without a second query).
 */
export async function getPipelineServicio(): Promise<PipelineServicioRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_pipeline_servicio")
    .select("servicio_codigo, oportunidades")
    .order("oportunidades", { ascending: false });

  return (data ?? []).map((row) => ({
    servicioCodigo: row.servicio_codigo,
    oportunidades: row.oportunidades,
  }));
}

/**
 * Actividad Clientes face query helpers (task 3.4, design.md §4.3, spec
 * dashboard-actividad). A SINGLE windowed fetch of `v_actividad_cliente`
 * (task 3.4's `getActividadWindow`) backs every derived metric — the feed,
 * the weekly volume chart, the most-active-clientes chart, and the
 * new-this-period tiles are all PURE functions over that one result set
 * (design.md §4.3/§7: "avoid N+1 ... replaces four per-cliente queries with
 * one"), never four separate round trips. RLS is inherited entirely from
 * the view (dashboard_actividad_views migration) — never re-checked here; a
 * caller without `crm.ver` gets `[]` from `getActividadWindow`, which every
 * pure helper below already treats as "no activity", same "ignore error,
 * default to zeros/[]" convention as the Pipeline helpers above.
 */

export type ActividadTipo =
  "bitacora" | "contacto_nuevo" | "oportunidad_nueva" | "oportunidad_gestion";

export interface ActividadRawEvent {
  tipo: ActividadTipo;
  clienteId: number;
  actorId: string | null;
  detalle: string;
  ocurridoEn: string;
}

const ACTIVIDAD_WINDOW_DAYS_DEFAULT = 30;
const ACTIVIDAD_FEED_LIMIT_DEFAULT = 20;
const ACTIVIDAD_CLIENTES_TOP_N_DEFAULT = 8;

/** Sentinel `clienteId` for the folded "9th+ never a new hue" bucket (design.md §5), mirroring `OTROS_SERVICIO_CODE`. */
export const OTROS_CLIENTE_ID = -1;

/**
 * The single windowed fetch every other Actividad helper below derives from
 * (task 3.4). Defaults to a 30-day window (design.md §4.3). Rows arrive
 * newest-first (`order by ocurrido_en desc`) directly from the view, so the
 * feed helper never needs to re-sort.
 */
export async function getActividadWindow(
  windowDays: number = ACTIVIDAD_WINDOW_DAYS_DEFAULT,
): Promise<ActividadRawEvent[]> {
  const supabase = await createClient();
  const cutoff = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data } = await supabase
    .from("v_actividad_cliente")
    .select("tipo, cliente_id, actor_id, detalle, ocurrido_en")
    .gte("ocurrido_en", cutoff)
    .order("ocurrido_en", { ascending: false });

  return (data ?? []).map((row) => ({
    tipo: row.tipo as ActividadTipo,
    clienteId: row.cliente_id,
    actorId: row.actor_id,
    detalle: row.detalle,
    ocurridoEn: row.ocurrido_en,
  }));
}

/** All visible clientes' display names, keyed by id (task 3.4) — same "fetch the whole lookup map" convention as `getCatalogoOptions`/`getUsuarioDirectory`. */
export async function getClienteNombreMap(): Promise<Map<number, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_cliente").select("id, nombre");

  const map = new Map<number, string>();
  for (const row of data ?? []) {
    map.set(row.id, row.nombre);
  }
  return map;
}

/**
 * Recent-activity feed (task 3.3/3.4, spec "feed merges the four event
 * types newest-first"): rows arrive PRE-SORTED desc from `getActividadWindow`
 * (the view's own `order by`) — this is a pure slice, never a re-sort. Pure
 * function, independently unit-testable without a DB.
 */
export function limitActividadFeed(
  rows: ActividadRawEvent[],
  limit: number = ACTIVIDAD_FEED_LIMIT_DEFAULT,
): ActividadRawEvent[] {
  return rows.slice(0, limit);
}

export interface ActividadVolumeSemana {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this UTC week bucket. */
  semana: string;
  eventos: number;
}

/** Monday-start ISO week-bucket key (YYYY-MM-DD, UTC) for a given timestamp. */
function weekStartKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Activity volume by week (task 3.3/3.4, spec "activity volume over time"):
 * groups the windowed rows into Monday-start week buckets, returned ASCENDING
 * by week (chronological, matching `LineArea`'s left-to-right convention —
 * the opposite order of the newest-first feed above). Pure function.
 */
export function groupActividadPorSemana(
  rows: ActividadRawEvent[],
): ActividadVolumeSemana[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = weekStartKey(row.ocurridoEn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([semana, eventos]) => ({ semana, eventos }))
    .sort((a, b) => a.semana.localeCompare(b.semana));
}

export interface ActividadClienteCount {
  clienteId: number;
  eventos: number;
}

/**
 * Most active clientes (task 3.3/3.4, spec "most active clientes ... top N
 * plus Otros"): ranks clientes by event count over the window, folding
 * everything beyond `topN` into a single `OTROS_CLIENTE_ID` bucket — same
 * "9th+ never a new hue" fold as `topNServicioWithOtros` above, keyed by
 * cliente instead of servicio. Pure function.
 */
export function topClientesActivos(
  rows: ActividadRawEvent[],
  topN: number = ACTIVIDAD_CLIENTES_TOP_N_DEFAULT,
): ActividadClienteCount[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.clienteId, (counts.get(row.clienteId) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([clienteId, eventos]) => ({ clienteId, eventos }))
    .sort((a, b) => b.eventos - a.eventos);

  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otrosTotal = rest.reduce((sum, row) => sum + row.eventos, 0);

  return [...top, { clienteId: OTROS_CLIENTE_ID, eventos: otrosTotal }];
}

export interface ActividadNuevos {
  nuevosContactos: number;
  nuevasOportunidades: number;
}

/**
 * New-this-period headlines (task 3.3/3.4, spec "new contactos"/"new
 * oportunidades"): counts `contacto_nuevo`/`oportunidad_nueva` events over
 * the window — `bitacora`/`oportunidad_gestion` are deliberately excluded
 * (they are not "new" events). Pure function.
 */
export function countActividadNuevos(
  rows: ActividadRawEvent[],
): ActividadNuevos {
  let nuevosContactos = 0;
  let nuevasOportunidades = 0;

  for (const row of rows) {
    if (row.tipo === "contacto_nuevo") nuevosContactos += 1;
    else if (row.tipo === "oportunidad_nueva") nuevasOportunidades += 1;
  }

  return { nuevosContactos, nuevasOportunidades };
}

const RELATIVE_TIME_UNITS: Array<{
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("es", {
  numeric: "auto",
});

/**
 * Relative timestamp for a feed item (task 3.3/3.6, spec "each item shows
 * ... a relative timestamp"). `now` is injectable so this stays a pure,
 * deterministic function under test — `page.tsx` calls it with no second
 * argument (defaults to the real current time). Pure function.
 */
export function formatActividadRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const diffMs = new Date(iso).getTime() - now.getTime(); // negative = past

  for (const { unit, ms } of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return relativeTimeFormatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return relativeTimeFormatter.format(Math.round(diffMs / 1000), "second");
}

/**
 * Tareas face query helpers (task 4.4, design.md §4.2, spec dashboard-tareas).
 * `v_dashboard_tareas_estado` / `v_dashboard_tareas_responsable` /
 * `v_dashboard_tareas_throughput` (dashboard_tareas_views migration) already
 * inherit the origen-aware `tarea_select` RLS AND the `vencido` derived
 * column from `v_tarea` — never re-checked/recomputed here. A caller
 * lacking both `crm.ver` and `kanban.ver` gets `[]`/zero from every helper
 * below, same "ignore error, default to zeros/[]" convention as every other
 * dashboard face. Task 4.0 gate re-confirmed the `tarea` contract is
 * unchanged from design.md (see apply-progress) — no `completed_at` column
 * exists, so throughput stays an approximation.
 */

export interface TareaEstadoRow {
  estado: string;
  tareas: number;
  vencidas: number;
}

/**
 * Count + overdue count per `estado` (task 4.4). Estado VALUES themselves
 * come straight from the view's `group by estado` — never a hardcoded list
 * — so a Kanban-side estado addition/rename shows up as a new/renamed row
 * automatically, matching spec dashboard-tareas' "read from the data, not
 * hardcoded" requirement. Defaults to `[]` on no data/error.
 */
export async function getTareasEstado(): Promise<TareaEstadoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_tareas_estado")
    .select("estado, tareas, vencidas");

  return (data ?? []).map((row) => ({
    estado: row.estado,
    tareas: row.tareas,
    vencidas: row.vencidas,
  }));
}

/**
 * Overdue (vencidas) headline (task 4.4, spec "Overdue (vencidas) headline"):
 * sums the per-estado `vencidas` column already derived by the view — design
 * §4.2 explicitly avoids a dedicated headline view ("no extra view"). Pure
 * function.
 */
export function sumTareasVencidas(rows: TareaEstadoRow[]): number {
  return rows.reduce((sum, row) => sum + row.vencidas, 0);
}

export interface TareaResponsableRow {
  responsableId: string | null;
  abiertas: number;
  vencidas: number;
}

/**
 * Open (`pendiente`/`en_curso`) + overdue count per responsable (task 4.4).
 * `responsable_id` is nullable (a `borrador` tarea has none, D4) — the raw
 * row is returned as-is; folding out the null-responsable group and
 * resolving display names happens in `topResponsablesWithOtros` /
 * `page.tsx` (same "raw fetch, pure helpers derive" split as Actividad's
 * `getActividadWindow`). Defaults to `[]` on no data/error.
 */
export async function getTareasResponsable(): Promise<TareaResponsableRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_tareas_responsable")
    .select("responsable_id, abiertas, vencidas");

  return (data ?? []).map((row) => ({
    responsableId: row.responsable_id,
    abiertas: row.abiertas,
    vencidas: row.vencidas,
  }));
}

/** Sentinel `responsableId` for the folded "9th+ never a new hue" bucket (design.md §5), mirroring `OTROS_CLIENTE_ID`/`OTROS_SERVICIO_CODE`. */
export const OTROS_RESPONSABLE_ID = "__otros__";

const RESPONSABLE_TOP_N = 8;

/**
 * Top-N open-workload responsables + "Otros" (task 4.4, spec "Open tareas by
 * responsable"): drops the null-responsable group (an unassigned `borrador`
 * tarea has no responsable to chart, D4), ranks by `abiertas` descending,
 * and folds everything beyond `topN` into a single Otros bucket (summing
 * BOTH `abiertas` and `vencidas`, so overdue stays distinguishable even
 * inside the fold) — same "9th+ never a new hue" pattern as
 * `topClientesActivos`/`topNServicioWithOtros`. Returns raw ids (never
 * resolves names) — the caller joins `v_usuario_activo` via
 * `resolveUsuarioLabel`, same split `page.tsx` already uses for Actividad's
 * cliente names. Pure function.
 */
export function topResponsablesWithOtros(
  rows: TareaResponsableRow[],
  topN: number = RESPONSABLE_TOP_N,
): TareaResponsableRow[] {
  const assigned = rows.filter(
    (row): row is TareaResponsableRow & { responsableId: string } =>
      row.responsableId !== null,
  );
  const sorted = [...assigned].sort((a, b) => b.abiertas - a.abiertas);

  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otros = rest.reduce(
    (acc, row) => ({
      abiertas: acc.abiertas + row.abiertas,
      vencidas: acc.vencidas + row.vencidas,
    }),
    { abiertas: 0, vencidas: 0 },
  );

  return [...top, { responsableId: OTROS_RESPONSABLE_ID, ...otros }];
}

export interface TareaThroughputSemana {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this UTC week bucket. */
  semana: string;
  cumplidas: number;
}

/**
 * Weekly completed-tareas throughput (task 4.4, spec "Throughput over
 * time"): reads `v_dashboard_tareas_throughput` ascending by week
 * (chronological, matching `LineArea`'s left-to-right convention). This is
 * an APPROXIMATION (`cumplido` rows bucketed by `updated_at` — `tarea` has
 * no completion timestamp today, design.md's Kanban Dependency table);
 * `page.tsx`/the face pass `es.dashboard.tareas.charts.throughputAproximado`
 * to `LineArea`'s `approximateLabel` prop. Defaults to `[]` on no
 * data/error.
 */
export async function getTareasThroughput(): Promise<TareaThroughputSemana[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_tareas_throughput")
    .select("semana, cumplidas")
    .order("semana", { ascending: true });

  return (data ?? []).map((row) => ({
    semana: row.semana,
    cumplidas: row.cumplidas,
  }));
}

/**
 * Mi Resumen face query helpers (task 5.4/5.7, design.md §4.4, spec
 * dashboard-mi-resumen). `v_dashboard_mi_resumen_tareas` /
 * `v_dashboard_mis_clientes` (dashboard_mi_resumen_views migration) are
 * self-scoped by `= (select auth.uid())` INSIDE the view, on top of the
 * origen-aware `tarea_select`/`cliente_select` RLS inherited from `v_tarea`/
 * `v_cliente` — never re-checked/re-scoped here. Task 5.7 gate re-confirmed
 * the Kanban `tarea` contract is unchanged (no `completed_at`, see
 * apply-progress), so the FULL-ORIGEN headlines (mis tareas abiertas,
 * vencidas, vencen pronto) below are never `origen`-filtered — only
 * `sumMisCompromisos` (the CRM/Ambos-only independent slice) is. A caller
 * lacking every visibility permission, or with nothing assigned, gets
 * `[]`/zero from every helper, same "ignore error, default to zeros/[]"
 * convention as every other dashboard face.
 */

export interface MiResumenTareaRow {
  estado: string;
  origen: string;
  tareas: number;
  vencidas: number;
  vencenPronto: number;
}

/** Self-scoped estado/origen rollup for the current user (task 5.4). Defaults to `[]` on no data/error. */
export async function getMiResumenTareas(): Promise<MiResumenTareaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_mi_resumen_tareas")
    .select("estado, origen, tareas, vencidas, vencen_pronto");

  return (data ?? []).map((row) => ({
    estado: row.estado,
    origen: row.origen,
    tareas: row.tareas,
    vencidas: row.vencidas,
    vencenPronto: row.vencen_pronto,
  }));
}

/**
 * Self-scoped "mis clientes" headline (task 5.4, spec "My clients"). This
 * view has NO `group by` (a single scalar row, design.md §4.4), so it always
 * returns exactly one row even when the caller owns zero clientes — that
 * row's count is simply 0. Still defaults to 0 if `data` is somehow null.
 */
export async function getMisClientes(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dashboard_mis_clientes")
    .select("mis_clientes")
    .maybeSingle();

  return data?.mis_clientes ?? 0;
}

/** The two estados that CLOSE a tarea. Everything else counts as open. */
const TERMINAL_ESTADOS_MI_RESUMEN = new Set(["cumplido", "cancelado"]);
const COMPROMISO_ORIGENES = new Set(["CRM", "Ambos"]);

/**
 * "Mis tareas abiertas" headline (task 5.4/5.7, spec "My open tareas ...
 * headlines"): sums `tareas` for `pendiente`/`en_curso` rows across EVERY
 * `origen` — this is the full-origen count task 5.7 unblocks, it never
 * filters by `origen`. Pure function.
 */
export function sumMisTareasAbiertas(rows: MiResumenTareaRow[]): number {
  return rows
    .filter((row) => row.estado === "pendiente" || row.estado === "en_curso")
    .reduce((sum, row) => sum + row.tareas, 0);
}

/**
 * "Mis compromisos" headline (task 5.4, spec "my compromisos tile ... CRM
 * slice, independent"): sums non-terminal `tareas` restricted to
 * `origen in ('CRM','Ambos')` — this is the Kanban-INDEPENDENT slice, the
 * only helper here that filters by `origen`. Pure function.
 */
export function sumMisCompromisos(rows: MiResumenTareaRow[]): number {
  return rows
    .filter(
      (row) =>
        COMPROMISO_ORIGENES.has(row.origen) &&
        !TERMINAL_ESTADOS_MI_RESUMEN.has(row.estado),
    )
    .reduce((sum, row) => sum + row.tareas, 0);
}

/**
 * "Vencidas" headline (task 5.4/5.7, spec "overdue uses the derived vencido
 * column"): sums the view's own `vencidas` column across every estado/origen
 * row — never recomputed, full-origen (task 5.7). Pure function.
 */
export function sumMisTareasVencidas(rows: MiResumenTareaRow[]): number {
  return rows.reduce((sum, row) => sum + row.vencidas, 0);
}

/**
 * "Vencen pronto" headline (task 5.4/5.7, spec "due-soon horizon"): sums the
 * view's own `vencen_pronto` column (already excludes terminal rows and
 * enforces the 7-day horizon at the DB layer) across every estado/origen
 * row — full-origen (task 5.7). Pure function.
 */
export function sumMisTareasVencenPronto(rows: MiResumenTareaRow[]): number {
  return rows.reduce((sum, row) => sum + row.vencenPronto, 0);
}

export interface MiResumenEstadoRow {
  estado: string;
  tareas: number;
}

/**
 * "Mis tareas por estado" small bar (task 5.3/5.7, design.md §5): folds the
 * per-origen split away, summing `tareas` per `estado` across every origen —
 * estado VALUES come straight from the rows, never a hardcoded list (same
 * "read from the data" convention as `getTareasEstado`). Pure function.
 */
export function groupMiResumenPorEstado(
  rows: MiResumenTareaRow[],
): MiResumenEstadoRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.estado, (totals.get(row.estado) ?? 0) + row.tareas);
  }
  return Array.from(totals.entries()).map(([estado, tareas]) => ({
    estado,
    tareas,
  }));
}

export interface MiAgendaItem {
  id: number;
  titulo: string;
  fechaLimite: string | null;
  estado: string;
  vencido: boolean;
}

const MI_AGENDA_LIMIT_DEFAULT = 10;

/**
 * My next non-terminal tareas ordered by `fecha_limite` ascending (task 5.4,
 * design.md §4.4 "reuses the getProximoCompromiso shape, generalized" —
 * `src/lib/crm/queries.ts`'s single-cliente lookup, generalized to a list
 * scoped by `responsable_id` instead of `cliente_id`). Reads `v_tarea`
 * directly (no dedicated view — the self-scope filter needs the caller's
 * own id, passed in by `page.tsx` via `getSessionContext()`, same pattern
 * `getProximoCompromiso` already uses for its own explicit id parameter).
 * Defaults to `[]` on no data/error.
 */
export async function getMiAgenda(
  userId: string,
  limit: number = MI_AGENDA_LIMIT_DEFAULT,
): Promise<MiAgendaItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select("id, titulo, fecha_limite, estado, vencido")
    .eq("responsable_id", userId)
    .not("estado", "in", "(cumplido,cancelado)")
    .order("fecha_limite", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    titulo: row.titulo,
    fechaLimite: row.fecha_limite,
    estado: row.estado,
    vencido: row.vencido,
  }));
}
