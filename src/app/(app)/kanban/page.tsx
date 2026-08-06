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
import { BoardFilters } from "./board-filters";
import type { BoardColumnData } from "./board-column";
import { ScopeToggle } from "./scope-toggle";
import { TareaFormDialog, type TareaFormOptions } from "./tarea-form-dialog";
import { BOARD_PATH, KanbanViewTabs } from "./view-tabs";

export const metadata: Metadata = {
  title: `${es.kanban.title} · ${es.common.appName}`,
};

interface KanbanPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * Board view (slices 4b/5b/6; design part 2 §12, spec KB1/KV1/KV2). Columns come
 * from `v_catalogo(tipo='columna_tablero')` (already active-only) and cards from
 * `v_tarea` filtered `origen in ('Kanban','Ambos')`, grouped server-side by
 * `groupTareasByColumna` and ordered within each column by `sortTareasForBoard`.
 *
 * Filters and scope come from the URL and are applied as QUERIES by
 * `loadBoardView` — the same loader the list view uses, so KV1's "same rows, two
 * presentations" holds by construction. Nothing here filters client-side, so the
 * board never ships rows it then hides.
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
    clienteOptions,
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
          <KanbanViewTabs current={BOARD_PATH} params={params} />
          <ScopeToggle
            scope={filters.scope}
            params={params}
            basePath={BOARD_PATH}
          />
          <TareaFormDialog mode="create" {...formOptions} />
        </div>
      </div>
      <BoardFilters
        values={filters}
        params={params}
        basePath={BOARD_PATH}
        usuarioOptions={usuarioOptions}
        prioridadOptions={prioridadOptions}
        etiquetaOptions={etiquetaOptions}
        clienteOptions={clienteOptions}
      />
      <KanbanBoard columns={columns} formOptions={formOptions} />
    </div>
  );
}
