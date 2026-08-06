import type { Metadata } from "next";

import { es } from "@/messages/es";
import { resolveUsuarioLabel } from "@/lib/admin/directory";
import { loadBoardView } from "@/lib/kanban/board-data";
import {
  groupTareasByColumna,
  sortTareasForBoard,
} from "@/lib/kanban/columnas";
import type { SearchParamsRecord } from "@/lib/kanban/filtros";
import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";
import { ScopeToggle } from "./scope-toggle";
import { TareaFormDialog, type TareaFormOptions } from "./tarea-form-dialog";

export const BOARD_PATH = "/kanban";

export const metadata: Metadata = {
  title: `${es.kanban.title} · ${es.common.appName}`,
};

interface KanbanPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * Board view (slices 4b/5b/6; design part 2 §12, spec KB1/KV2). Columns come
 * from `v_catalogo(tipo='columna_tablero')` (already active-only) and cards from
 * `v_tarea` filtered `origen in ('Kanban','Ambos')`, grouped server-side by
 * `groupTareasByColumna` and ordered within each column by `sortTareasForBoard`.
 *
 * Scope and filters come from the URL and are applied as QUERIES by
 * `loadBoardView`, so the board never ships rows it then hides. Every KV1 filter
 * is already honoured here by deep link; the form that composes those URLs lands
 * in the next slice, and the list view that shares this loader after it.
 */
export default async function KanbanPage({ searchParams }: KanbanPageProps) {
  const params = await searchParams;
  const {
    filters,
    tareas,
    columnas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    defaultResponsableId,
  } = await loadBoardView(params);

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

  const formOptions: TareaFormOptions = {
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    defaultResponsableId,
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
        <div className="flex flex-wrap items-center gap-2">
          <ScopeToggle
            scope={filters.scope}
            params={params}
            basePath={BOARD_PATH}
          />
          <TareaFormDialog mode="create" {...formOptions} />
        </div>
      </div>
      <KanbanBoard columns={columns} formOptions={formOptions} />
    </div>
  );
}
