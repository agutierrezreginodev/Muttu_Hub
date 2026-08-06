"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { moveTareaAction } from "@/lib/kanban/actions";
import {
  sortTareasForBoard,
  type CatalogoPickerOption,
} from "@/lib/kanban/columnas";
import { toast } from "@/components/ui/toast";
import { BoardColumn, type BoardColumnData } from "./board-column";
import type { TareaFormOptions } from "./tarea-form-dialog";

interface KanbanBoardProps {
  columns: BoardColumnData[];
  formOptions: TareaFormOptions;
}

/** Moves a card between columns, keeping the destination's own order rule. */
function applyMove(
  columns: BoardColumnData[],
  tareaId: number,
  columnaDestino: string,
): BoardColumnData[] {
  const moved = columns
    .flatMap((column) => column.tareas)
    .find((tarea) => tarea.id === tareaId);

  if (!moved) {
    return columns;
  }

  return columns.map((column) => {
    if (column.codigo === columnaDestino) {
      // Re-sorted rather than appended: the destination's order rule
      // (fecha_limite -> prioridad -> created_at, design part 2 §12) has to hold
      // optimistically too, or the card visibly jumps when the server's own
      // ordering arrives a moment later.
      return {
        ...column,
        tareas: sortTareasForBoard([...column.tareas, moved]),
      };
    }
    return {
      ...column,
      tareas: column.tareas.filter((tarea) => tarea.id !== tareaId),
    };
  });
}

/**
 * Board orchestrator (slice 5b; design D9/§6). Owns the optimistic move and is
 * the ONLY client-side caller of `moveTareaAction`: the drag path and the
 * "Mover a…" menu both funnel through `dispatchMove`, mirroring on the client
 * the single-enforcement-point rule the action enforces on the server.
 *
 * On rejection the previous layout is restored AND the server's message is
 * surfaced. Neither half is optional: a card left in its destination would be a
 * lie about persisted state, and a card that silently springs back reads as
 * "the drop never registered".
 */
export function KanbanBoard({ columns, formOptions }: KanbanBoardProps) {
  const [boardColumns, setBoardColumns] = useState(columns);
  const [serverColumns, setServerColumns] = useState(columns);
  const [draggedTareaId, setDraggedTareaId] = useState<number | null>(null);

  // `revalidatePath` re-renders this client component with fresh props, and
  // adopting them during render is React's documented alternative to a syncing
  // effect. It is required, not a nicety: keeping the first `columns` in state
  // forever would strand the board on a stale snapshot, so a card created,
  // edited or deleted anywhere would not appear until a full page load.
  if (serverColumns !== columns) {
    setServerColumns(columns);
    setBoardColumns(columns);
  }

  function columnaDeTarea(tareaId: number): string | undefined {
    return boardColumns.find((column) =>
      column.tareas.some((tarea) => tarea.id === tareaId),
    )?.codigo;
  }

  async function dispatchMove(tareaId: number, columnaDestino: string) {
    // A drop on the column the card already sits in is a no-op round trip.
    if (columnaDeTarea(tareaId) === columnaDestino) {
      return;
    }

    const previous = boardColumns;
    setBoardColumns(applyMove(previous, tareaId, columnaDestino));

    const result = await moveTareaAction({ tareaId, columnaDestino });

    if (result.error) {
      setBoardColumns(previous);
      toast.add({ title: result.error, type: "error" });
    }
  }

  const columnasParaMenu: CatalogoPickerOption[] = boardColumns.map(
    (column) => ({ codigo: column.codigo, etiqueta: column.etiqueta }),
  );

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2"
      aria-label={es.kanban.title}
    >
      {boardColumns.map((column) => (
        <BoardColumn
          key={column.codigo}
          column={column}
          formOptions={formOptions}
          move={{
            columnas: columnasParaMenu,
            onCardDragStart: setDraggedTareaId,
            onColumnDrop: (codigo) => {
              if (draggedTareaId !== null) {
                void dispatchMove(draggedTareaId, codigo);
                setDraggedTareaId(null);
              }
            },
            onMoveSelect: (tareaId, codigo) =>
              void dispatchMove(tareaId, codigo),
          }}
        />
      ))}
    </div>
  );
}
