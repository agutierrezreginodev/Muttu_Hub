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
import { BOARD_SCOPES, SCOPE_PARAM, parseScope } from "@/lib/kanban/filtros";
import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";
import { ScopeToggle } from "./scope-toggle";
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
 * The scope comes from the URL (design D10, spec KV2) and is applied as a
 * QUERY: "Mi tablero" narrows `listBoardTareas` by `responsable_id`, so the
 * board never ships rows it then hides. The KV1 field filters land in slice 6.
 */
export default async function KanbanPage({ searchParams }: KanbanPageProps) {
  const params = await searchParams;
  const scope = parseScope(params[SCOPE_PARAM]);

  // Awaited before the board query because the "mine" scope needs the caller's
  // own id. `React.cache()` means the layout's earlier call is reused — this is
  // the same round trip, not an extra one.
  const session = await getSessionContext();
  const responsableId =
    scope === BOARD_SCOPES.mio ? (session?.userId ?? undefined) : undefined;

  const [
    tareas,
    columnas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
  ] = await Promise.all([
    listBoardTareas({ responsableId }),
    listColumnas(),
    getUsuarioDirectory(),
    listUsuarioOptions(),
    listPrioridadOptions(),
    listEtiquetaOptions(),
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
        <div className="flex flex-wrap items-center gap-2">
          <ScopeToggle scope={scope} params={params} />
          <TareaFormDialog mode="create" {...formOptions} />
        </div>
      </div>
      <KanbanBoard columns={columns} formOptions={formOptions} />
    </div>
  );
}
