import type { Metadata } from "next";

import { es } from "@/messages/es";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { listBoardTareas, listColumnas } from "@/lib/kanban/queries";
import { groupTareasByColumna, sortTareasForBoard } from "@/lib/kanban/columnas";
import { KanbanBoard } from "./board";
import type { BoardColumnData } from "./board-column";

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

  const [tareas, columnas, directory] = await Promise.all([
    listBoardTareas(),
    listColumnas(),
    getUsuarioDirectory(),
  ]);

  const cards = tareas.map((tarea) => ({
    id: tarea.id,
    titulo: tarea.titulo,
    columna: tarea.columna,
    responsableLabel: resolveUsuarioLabel(directory, tarea.responsableId),
    fechaLimite: tarea.fechaLimite,
    prioridad: tarea.prioridad,
    etiquetas: tarea.etiquetas,
    vencido: tarea.vencido,
    createdAt: tarea.createdAt,
  }));

  const grouped = groupTareasByColumna(cards, columnas);

  const columns: BoardColumnData[] = columnas.map((columna) => ({
    codigo: columna.codigo,
    etiqueta: columna.etiqueta,
    tareas: sortTareasForBoard(grouped.get(columna.codigo) ?? []),
  }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.kanban.title}</h1>
      <KanbanBoard columns={columns} />
    </div>
  );
}
