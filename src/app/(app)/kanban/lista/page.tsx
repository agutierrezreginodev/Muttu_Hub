import type { Metadata } from "next";

import { es } from "@/messages/es";
import { resolveUsuarioLabel } from "@/lib/admin/directory";
import { loadBoardView } from "@/lib/kanban/board-data";
import { fallbackColumna } from "@/lib/kanban/columnas";
import type { SearchParamsRecord } from "@/lib/kanban/filtros";
import { BoardFilters } from "../board-filters";
import { ScopeToggle } from "../scope-toggle";
import { KanbanViewTabs, LISTA_PATH } from "../view-tabs";
import { TareaListTable, type TareaListRow } from "./tarea-list-table";

export const metadata: Metadata = {
  title: `${es.kanban.lista.nav} · ${es.kanban.title} · ${es.common.appName}`,
};

interface ListaPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * List view (slice 6, spec KV1): the SAME rows the board renders, under the same
 * filters and the same scope, as a table. `loadBoardView` is shared with the
 * board precisely so the two views cannot drift into showing different data.
 *
 * `columna` is resolved to its display label here, and a null `columna` resolves
 * to the FALLBACK column — the same fold `groupTareasByColumna` applies on the
 * board (design D3). Rendering "—" instead would tell the user the card is
 * nowhere, when the board plainly shows it in the first column.
 */
export default async function KanbanListaPage({
  searchParams,
}: ListaPageProps) {
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
  } = await loadBoardView(params);

  const columnaLabels = new Map(
    columnas.map((columna) => [columna.codigo, columna.etiqueta]),
  );
  const clienteLabels = new Map(
    clienteOptions.map((cliente) => [cliente.id, cliente.nombre]),
  );
  const fallback = fallbackColumna(columnas);

  const rows: TareaListRow[] = tareas.map((tarea) => {
    const codigo = tarea.columna ?? fallback;
    return {
      id: tarea.id,
      titulo: tarea.titulo,
      responsableLabel: resolveUsuarioLabel(directory, tarea.responsableId),
      clienteLabel:
        tarea.clienteId !== null
          ? (clienteLabels.get(tarea.clienteId) ?? null)
          : null,
      // An unknown/deactivated code keeps its raw value rather than vanishing:
      // the board folds such a card into the fallback lane, and hiding the
      // discrepancy here would make the table lie about a real data state.
      columnaLabel:
        (codigo !== null ? columnaLabels.get(codigo) : undefined) ??
        codigo ??
        "—",
      fechaLimite: tarea.fechaLimite,
      prioridad: tarea.prioridad,
      etiquetas: tarea.etiquetas,
      vencido: tarea.vencido,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.kanban.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <KanbanViewTabs current={LISTA_PATH} params={params} />
          <ScopeToggle
            scope={filters.scope}
            params={params}
            basePath={LISTA_PATH}
          />
        </div>
      </div>
      <BoardFilters
        values={filters}
        params={params}
        basePath={LISTA_PATH}
        usuarioOptions={usuarioOptions}
        prioridadOptions={prioridadOptions}
        etiquetaOptions={etiquetaOptions}
        clienteOptions={clienteOptions}
      />
      <TareaListTable rows={rows} />
    </div>
  );
}
