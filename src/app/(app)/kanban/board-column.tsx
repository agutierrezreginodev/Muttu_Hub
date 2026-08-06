import { es } from "@/messages/es";
import type { CatalogoPickerOption } from "@/lib/kanban/columnas";
import { MoverAMenu } from "./mover-a-menu";
import { TareaCard, type KanbanCardData } from "./tarea-card";
import type { TareaFormOptions } from "./tarea-form-dialog";

export interface BoardColumnData {
  codigo: string;
  etiqueta: string;
  tareas: KanbanCardData[];
}

/**
 * The two move paths, supplied by the board (slice 5b). Grouped into one prop
 * because they only ever travel together, and because the column itself decides
 * nothing here: it reports drag and menu intent upward and the board owns the
 * action call and the rollback.
 */
export interface BoardMoveApi {
  /** ACTIVE columns in `orden` — the menu's offered destinations. */
  columnas: CatalogoPickerOption[];
  onCardDragStart: (tareaId: number) => void;
  onColumnDrop: (codigo: string) => void;
  onMoveSelect: (tareaId: number, codigo: string) => void;
}

interface BoardColumnProps {
  column: BoardColumnData;
  /** Threaded straight through to each card's edit dialog (slice 5a). */
  formOptions: TareaFormOptions;
  move: BoardMoveApi;
}

/**
 * Column header + count + empty state + drop target (slices 4b and 5b; design
 * part 2 §12, spec KB1). No `"use client"` directive: this component has no
 * hooks and no server-only import, so it works fine transitively bundled from
 * `board.tsx` (client) without needing its own boundary.
 *
 * `onDragOver` calls `preventDefault` for one non-obvious reason: the HTML drag
 * and drop spec treats an element as a NON-drop-target by default, and `drop`
 * simply never fires without it.
 *
 * The drag handle is a wrapper around the card, not the card itself, so
 * `TareaCard` stays purely presentational and its 4b contract is untouched.
 */
export function BoardColumn({ column, formOptions, move }: BoardColumnProps) {
  return (
    <section
      aria-label={column.etiqueta}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        move.onColumnDrop(column.codigo);
      }}
      className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-2"
    >
      <header className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{column.etiqueta}</h2>
        <span className="text-xs text-muted-foreground">
          {column.tareas.length}
        </span>
      </header>
      {column.tareas.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {es.kanban.columnas.emptyState}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {column.tareas.map((tarea) => (
            <div
              key={tarea.id}
              draggable
              data-testid={`tarea-drag-${tarea.id}`}
              onDragStart={() => move.onCardDragStart(tarea.id)}
              className="flex flex-col gap-1"
            >
              <TareaCard tarea={tarea} formOptions={formOptions} />
              <MoverAMenu
                columnas={move.columnas}
                columnaActual={column.codigo}
                onSelect={(codigo) => move.onMoveSelect(tarea.id, codigo)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
