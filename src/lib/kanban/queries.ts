import { createClient } from "@/lib/supabase/server";
import {
  COLUMNA_TIPO,
  ETIQUETA_TIPO,
  PRIORIDAD_TIPO,
} from "@/lib/kanban/columnas";

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
 * No `filters` parameter yet: `board-filters.tsx` and `scope-toggle.tsx`
 * (design D10's URL-`searchParams`-driven filter/scope UI) do not exist
 * until slice 5b, so there is nothing in THIS slice that would actually
 * exercise a filter branch — adding one now would be untested, dead code.
 * The signature gains parameters once a caller needs them.
 */
export async function listBoardTareas(): Promise<BoardTarea[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select(
      "id, titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, etiquetas, origen, columna, vencido, created_at",
    )
    .in("origen", TAREA_KANBAN_ORIGENES);

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

export interface CatalogoPickerOption {
  codigo: string;
  etiqueta: string;
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
