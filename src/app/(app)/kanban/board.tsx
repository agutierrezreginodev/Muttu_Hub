"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { BoardColumn, type BoardColumnData } from "./board-column";

interface KanbanBoardProps {
  columns: BoardColumnData[];
}

/**
 * DnD orchestrator scaffold (slice 4b; design part 2 §12). STATE ONLY in
 * this slice: `columns` is lifted into local state so slice 5b's drag/drop
 * handler and the "Mover a…" menu can mutate it optimistically without a
 * full page reload — nothing in 4b itself moves a card. `moveTareaAction`,
 * `draggable`/`onDragStart`/`onDragOver`/`onDrop`, and rollback-on-error land
 * in 5b.
 */
export function KanbanBoard({ columns }: KanbanBoardProps) {
  const [boardColumns] = useState(columns);

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2"
      aria-label={es.kanban.title}
    >
      {boardColumns.map((column) => (
        <BoardColumn key={column.codigo} column={column} />
      ))}
    </div>
  );
}
