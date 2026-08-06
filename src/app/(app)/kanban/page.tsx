import type { Metadata } from "next";

import { es } from "@/messages/es";
import {
  getUsuarioDirectory,
  listUsuarioOptions,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { getSessionContext } from "@/lib/session/get-session-context";
import {
  listBoardTareas,
  listColumnas,
  listEtiquetaOptions,
  listPrioridadOptions,
} from "@/lib/kanban/queries";
import {
  groupTareasByColumna,
  sortTareasForBoard,
} from "@/lib/kanban/columnas";
import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";
import { TareaFormDialog, type TareaFormOptions } from "./tarea-form-dialog";

export const metadata: Metadata = {
  title: `${es.kanban.title} · ${es.common.appName}`,
};

interface KanbanPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Read-only board render (slice 4b; design part 2 §12, spec KB1). Columns
 * come from `v_catalogo(tipo='columna_tablero')` (already active-only) and
 * cards from `v_tarea` filtered `origen in ('Kanban','Ambos')`
 * (`listBoardTareas`, `listColumnas` — `src/lib/kanban/queries.ts`), grouped
 * server-side via `groupTareasByColumna` (slice 4a) and ordered within each
 * column via `sortTareasForBoard` (this slice).
 *
 * `searchParams` is read — matching design D10's URL-`searchParams`-driven
 * filter/scope architecture — but not yet applied to either query:
 * `board-filters.tsx` and `scope-toggle.tsx` land in slice 5b, so no
 * filter/scope narrows this page's result set yet.
 */
export default async function KanbanPage({ searchParams }: KanbanPageProps) {
  await searchParams;

  const [
    tareas,
    columnas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    session,
  ] = await Promise.all([
    listBoardTareas(),
    listColumnas(),
    getUsuarioDirectory(),
    listUsuarioOptions(),
    listPrioridadOptions(),
    listEtiquetaOptions(),
    getSessionContext(),
  ]);

  const cards = tareas.map((tarea) => ({
    id: tarea.id,
    titulo: tarea.titulo,
    descripcion: tarea.descripcion,
    columna: tarea.columna,
    responsableId: tarea.responsableId,
    responsableLabel: resolveUsuarioLabel(directory, tarea.responsableId),
    clienteId: tarea.clienteId,
    fechaLimite: tarea.fechaLimite,
    prioridad: tarea.prioridad,
    etiquetas: tarea.etiquetas,
    vencido: tarea.vencido,
    createdAt: tarea.createdAt,
  }));

  /**
   * Spec KT1: create defaults the responsable to the current user rather than
   * asking. `getSessionContext()` is `React.cache()`d and the layout already
   * called it, so this is the same round trip, not a second one.
   */
  const formOptions: TareaFormOptions = {
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    defaultResponsableId: session?.userId ?? "",
  };

  const grouped = groupTareasByColumna(cards, columnas);

  const columns: BoardColumnData[] = columnas.map((columna) => ({
    codigo: columna.codigo,
    etiqueta: columna.etiqueta,
    tareas: sortTareasForBoard(grouped.get(columna.codigo) ?? []),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.kanban.title}</h1>
        <TareaFormDialog mode="create" {...formOptions} />
      </div>
      <KanbanBoard columns={columns} formOptions={formOptions} />
    </div>
  );
}
