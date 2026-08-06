import {
  getUsuarioDirectory,
  listUsuarioOptions,
  type UsuarioDirectory,
  type UsuarioOption,
} from "@/lib/admin/directory";
import { getSessionContext } from "@/lib/session/get-session-context";
import type { CatalogoPickerOption } from "@/lib/kanban/columnas";
import {
  BOARD_SCOPES,
  parseBoardFilters,
  type BoardFilterValues,
  type ClienteOption,
  type SearchParamsRecord,
} from "@/lib/kanban/filtros";
import {
  listBoardTareas,
  listClienteOptions,
  listColumnas,
  listEtiquetaOptions,
  listPrioridadOptions,
  type BoardColumna,
  type BoardTarea,
} from "@/lib/kanban/queries";

export interface BoardViewData {
  filters: BoardFilterValues;
  tareas: BoardTarea[];
  columnas: BoardColumna[];
  directory: UsuarioDirectory;
  usuarioOptions: UsuarioOption[];
  prioridadOptions: CatalogoPickerOption[];
  etiquetaOptions: CatalogoPickerOption[];
  clienteOptions: ClienteOption[];
  /** Current user — the tarea form defaults the responsable to them (KT1). */
  defaultResponsableId: string;
}

/**
 * One loader for BOTH kanban views (spec KV1). The board and the list must show
 * the same rows under the same filters and scope; sharing the loader makes that
 * true by construction instead of leaving two pages to agree with each other.
 * Each page then shapes its own view model from these pieces.
 *
 * The session is awaited BEFORE the parallel fetches because the "Mi tablero"
 * scope needs the caller's own id to become a query. `getSessionContext()` is
 * `React.cache()`d and the layout already called it, so this is the same round
 * trip rather than an extra one.
 */
export async function loadBoardView(
  params: SearchParamsRecord,
): Promise<BoardViewData> {
  const filters = parseBoardFilters(params);
  const session = await getSessionContext();

  // The scope narrows by responsable; an explicit responsable filter is a
  // different control. When both are present the filter wins, and inside "Mi
  // tablero" it can only ever narrow further, never widen.
  const responsableId =
    filters.responsableId ??
    (filters.scope === BOARD_SCOPES.mio ? session?.userId : undefined);

  const [
    tareas,
    columnas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    clienteOptions,
  ] = await Promise.all([
    listBoardTareas({
      responsableId,
      prioridad: filters.prioridad,
      etiqueta: filters.etiqueta,
      clienteId: filters.clienteId,
      vencidas: filters.vencidas,
      sinFecha: filters.sinFecha,
    }),
    listColumnas(),
    getUsuarioDirectory(),
    listUsuarioOptions(),
    listPrioridadOptions(),
    listEtiquetaOptions(),
    listClienteOptions(),
  ]);

  return {
    filters,
    tareas,
    columnas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    clienteOptions,
    defaultResponsableId: session?.userId ?? "",
  };
}
