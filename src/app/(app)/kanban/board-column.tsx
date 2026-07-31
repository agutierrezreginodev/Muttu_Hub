import { es } from "@/messages/es";
import { TareaCard, type KanbanCardData } from "./tarea-card";

export interface BoardColumnData {
  codigo: string;
  etiqueta: string;
  tareas: KanbanCardData[];
}

interface BoardColumnProps {
  column: BoardColumnData;
}

/**
 * Column header + count + empty state (slice 4b; design part 2 §12, spec
 * KB1). No `"use client"` directive: this component has no hooks and no
 * server-only import, so it works fine transitively bundled from
 * `board.tsx` (client) without needing its own boundary. Drop-target wiring
 * (`onDragOver`/`onDrop`) is deferred to slice 5b, once `moveTareaAction`
 * exists to call.
 */
export function BoardColumn({ column }: BoardColumnProps) {
  return (
    <section
      aria-label={column.etiqueta}
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
            <TareaCard key={tarea.id} tarea={tarea} />
          ))}
        </div>
      )}
    </section>
  );
}
