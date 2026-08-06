import { createClient } from "@/lib/supabase/server";
import {
  COLUMNA_TIPO,
  ETIQUETA_TIPO,
  PRIORIDAD_TIPO,
  type CatalogoPickerOption,
} from "@/lib/kanban/columnas";
import type { ClienteOption } from "@/lib/kanban/filtros";

export type { CatalogoPickerOption } from "@/lib/kanban/columnas";
export type { ClienteOption } from "@/lib/kanban/filtros";

/**
 * Slice 4a scaffolding (tasks: sdd/kanban-module/tasks, "Module shell").
 * `TAREA_KANBAN_ORIGENES` is the board's origen filter (design KB1: cards
 * are sourced from `v_tarea` filtered `origen in ('Kanban','Ambos')`),
 * symmetric to `src/lib/crm/queries.ts`'s `COMPROMISO_ORIGENES` (`origen in
 * ('CRM','Ambos')`).
 *
 * Unlike CRM's OWN internal partition (`COMPROMISO_ORIGENES` vs
 * `TAREA_RELACIONADA_ORIGEN`, which stays disjoint because the read-only
 * "Tareas relacionadas" tab deliberately excludes `'Ambos'`),
 * `TAREA_KANBAN_ORIGENES` and `COMPROMISO_ORIGENES` are NOT disjoint from
 * each other: `'Ambos'` belongs to BOTH sets by design (design D7/KP2). A
 * promoted compromiso (`origen: 'CRM' -> 'Ambos'`) must appear on the Kanban
 * board AND remain in the Compromisos tab simultaneously — that overlap is
 * the entire point of the promotion feature (slice 9), not a bug to fix.
 */
export const TAREA_KANBAN_ORIGENES = ["Kanban", "Ambos"] as const;

export function isKanbanOrigen(origen: string): boolean {
  return (TAREA_KANBAN_ORIGENES as readonly string[]).includes(origen);
}

export interface BoardColumna {
  codigo: string;
  etiqueta: string;
  orden: number;
}

/**
 * Board columns (slice 4b; design part 1 D1, spec KC1/KB1). Reads
 * `v_catalogo` — the ACTIVE-only picklist surface (`src/lib/crm/catalogos.ts`
 * documents the same convention) — never the base `catalogo` table, so a
 * deactivated column never appears as a board lane. `groupTareasByColumna`
 * (slice 4a, `src/lib/kanban/columnas.ts`) is what folds a card whose stored
 * `columna` references a deactivated/unknown code into the fallback bucket;
 * this function's own job is only "which lanes render at all", ordered by
 * `orden` (spec KB1).
 *
 * Matches the "empty list/array, not an error" convention every list
 * function in this codebase follows (`listClientes`, `listCompromisos`): a
 * caller without visibility gets `[]`, never a thrown error — `v_catalogo`
 * has no RLS restriction beyond `activo`, so this only actually degrades to
 * empty if no `columna_tablero` codes are active at all.
 */
export async function listColumnas(): Promise<BoardColumna[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_catalogo")
    .select("codigo, etiqueta, orden")
    .eq("tipo", COLUMNA_TIPO)
    .order("orden");

  return (data ?? []).map((row) => ({
    codigo: row.codigo,
    etiqueta: row.etiqueta,
    orden: row.orden,
  }));
}

export interface BoardTarea {
  id: number;
  titulo: string;
  /** Edit-dialog prefill only — the card render never shows it. */
  descripcion: string | null;
  responsableId: string | null;
  /** Edit-dialog prefill only, so a stored cliente survives an edit. */
  clienteId: number | null;
  fechaLimite: string | null;
  estado: string;
  prioridad: string | null;
  etiquetas: string[];
  origen: string;
  columna: string | null;
  vencido: boolean;
  createdAt: string;
}

function mapBoardTareaRow(row: {
  id: number;
  titulo: string;
  descripcion: string | null;
  responsable_id: string | null;
  cliente_id: number | null;
  fecha_limite: string | null;
  estado: string;
  prioridad: string | null;
  etiquetas: string[] | null;
  origen: string;
  columna: string | null;
  vencido: boolean;
  created_at: string;
}): BoardTarea {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    responsableId: row.responsable_id,
    clienteId: row.cliente_id,
    fechaLimite: row.fecha_limite,
    estado: row.estado,
    prioridad: row.prioridad,
    etiquetas: row.etiquetas ?? [],
    origen: row.origen,
    columna: row.columna,
    vencido: row.vencido,
    createdAt: row.created_at,
  };
}

/**
 * Board cards (slice 4b; design part 1 §3 + part 2 §12, spec KB1). Reads
 * `v_tarea` filtered `origen in ('Kanban','Ambos')` — the SAME
 * `TAREA_KANBAN_ORIGENES` constant `isKanbanOrigen()` classifies against
 * (slice 4a), so the query and the predicate can never drift apart. Relies
 * ENTIRELY on `tarea_select` RLS for visibility, same convention as every
 * other list function in this codebase: a caller without the
 * origen-appropriate `ver` permission gets `[]`, never a thrown error.
 *
 * Every filter is applied HERE, server-side (design D10, spec KV1/KV2), not in
 * the component: a narrowed view must not ship the rows it hides. The board and
 * the list view call this same function with the same filters, which is what
 * makes KV1's "same rows, two presentations" true by construction rather than by
 * two implementations agreeing.
 *
 * `vencidas` reads `v_tarea.vencido` rather than recomputing `fecha_limite <
 * now()`: the view's expression also excludes the terminal estados, and a
 * hand-rolled predicate here would quietly disagree with the badge the card
 * renders. `sinFecha` and `vencidas` together can only ever return zero rows —
 * `vencido` requires a `fecha_limite` — which is a legitimate, if useless,
 * combination and not worth blocking.
 */
export interface BoardFilters {
  responsableId?: string;
  prioridad?: string;
  etiqueta?: string;
  clienteId?: number;
  vencidas?: boolean;
  sinFecha?: boolean;
}

export async function listBoardTareas(
  filters: BoardFilters = {},
): Promise<BoardTarea[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_tarea")
    .select(
      "id, titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, etiquetas, origen, columna, vencido, created_at",
    )
    .in("origen", TAREA_KANBAN_ORIGENES);

  if (filters.responsableId) {
    query = query.eq("responsable_id", filters.responsableId);
  }
  if (filters.prioridad) {
    query = query.eq("prioridad", filters.prioridad);
  }
  if (filters.etiqueta) {
    // Array containment, backed by `tarea_etiquetas_gin_idx` (design D6) — the
    // only index that serves D4's tag filter.
    query = query.contains("etiquetas", [filters.etiqueta]);
  }
  if (filters.clienteId) {
    query = query.eq("cliente_id", filters.clienteId);
  }
  if (filters.vencidas) {
    query = query.eq("vencido", true);
  }
  if (filters.sinFecha) {
    query = query.is("fecha_limite", null);
  }

  const { data } = await query;

  return (data ?? []).map(mapBoardTareaRow);
}

/**
 * Active `etiqueta_tarea` codes for the tarea form's tag picker (spec KC4/D4).
 * Reads `v_catalogo` (active-only), so a deactivated tag is never OFFERED —
 * which is the display half of D4. The enforcement half lives in
 * `actions.ts`'s `assertEtiquetasActivas`, because a form that loaded its
 * options before a tag was retired would otherwise submit it happily.
 *
 * Kept separate from `listColumnas` rather than folded into one parameterised
 * catalog reader, so slice 4b's already-tested column behaviour stays
 * byte-unchanged.
 */
export async function listEtiquetaOptions(): Promise<CatalogoPickerOption[]> {
  return listCatalogoPicker(ETIQUETA_TIPO);
}

/** Active `prioridad` codes for the tarea form (same active-only surface). */
export async function listPrioridadOptions(): Promise<CatalogoPickerOption[]> {
  return listCatalogoPicker(PRIORIDAD_TIPO);
}

async function listCatalogoPicker(
  tipo: string,
): Promise<CatalogoPickerOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_catalogo")
    .select("codigo, etiqueta")
    .eq("tipo", tipo)
    .order("orden");

  return (data ?? []).map((row) => ({
    codigo: row.codigo,
    etiqueta: row.etiqueta,
  }));
}

/**
 * Clientes offered by the KV1 cliente filter. Reads `v_cliente`, so visibility
 * is `cliente_select` RLS: a caller without `crm.ver` gets an empty option list
 * rather than an error, matching every other list function here. Ordered by
 * nombre because a picker needs a stable order.
 */
export async function listClienteOptions(): Promise<ClienteOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_cliente")
    .select("id, nombre")
    .order("nombre");

  return (data ?? []).map((row) => ({ id: row.id, nombre: row.nombre }));
}

export interface ComentarioEntry {
  id: number;
  autorId: string;
  texto: string;
  createdAt: string;
}

/**
 * Comment thread for one tarea (spec KM1, design D8). Newest first, matching
 * `tarea_comentario_idx (tarea_id, created_at desc)` — the feed component never
 * re-sorts, so this order IS the rendered order.
 *
 * Visibility is `tarea_comentario_select`, which calls `private.tarea_visible`:
 * a caller who cannot see the tarea gets zero comments rather than an error, so
 * the thread degrades exactly like every other list here.
 */
export async function listComentarios(
  tareaId: number,
): Promise<ComentarioEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tarea_comentario")
    .select("id, autor_id, texto, created_at")
    .eq("tarea_id", tareaId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    autorId: row.autor_id,
    texto: row.texto,
    createdAt: row.created_at,
  }));
}

/**
 * One tarea for the detail route (slice 7). Reads `v_tarea`, so `tarea_select`
 * RLS decides: an invisible row comes back as `null` and the page turns that into
 * a 404 — never a "you are not allowed" that would confirm the row exists.
 *
 * Deliberately NOT filtered by origen, unlike `listBoardTareas`. This route is
 * the bell's deep-link target (slice 10), and the bell reports on every origen
 * the caller can see; filtering here would 404 a notification's own link.
 */
export async function getTareaDetalle(
  tareaId: number,
): Promise<BoardTarea | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select(
      "id, titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, etiquetas, origen, columna, vencido, created_at",
    )
    .eq("id", tareaId)
    .maybeSingle();

  return data ? mapBoardTareaRow(data) : null;
}
