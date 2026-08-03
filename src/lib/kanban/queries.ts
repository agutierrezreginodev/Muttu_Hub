/**
 * Slice 4a scaffolding (tasks: sdd/kanban-module/tasks, "Module shell").
 * `TAREA_KANBAN_ORIGENES` is the board's origen filter (design KB1: cards
 * are sourced from `v_tarea` filtered `origen in ('Kanban','Ambos')`),
 * symmetric to `src/lib/crm/queries.ts`'s `COMPROMISO_ORIGENES` (`origen in
 * ('CRM','Ambos')`).
 *
 * Unlike CRM's OWN internal partition (`COMPROMISO_ORIGENES` vs
 * `TAREA_RELACIONADA_ORIGEN`, which stays disjoint because the read-only
 * "Tareas relacionadas" tab deliberately excludes `'Ambos'`),
 * `TAREA_KANBAN_ORIGENES` and `COMPROMISO_ORIGENES` are NOT disjoint from
 * each other: `'Ambos'` belongs to BOTH sets by design (design D7/KP2). A
 * promoted compromiso (`origen: 'CRM' -> 'Ambos'`) must appear on the Kanban
 * board AND remain in the Compromisos tab simultaneously — that overlap is
 * the entire point of the promotion feature (slice 9), not a bug to fix.
 *
 * List/query helpers that read `v_tarea`/`v_catalogo` (`listBoardTareas`,
 * `listColumnas`) land in slice 4b, once the board route exists to consume
 * them.
 */
export const TAREA_KANBAN_ORIGENES = ["Kanban", "Ambos"] as const;

export function isKanbanOrigen(origen: string): boolean {
  return (TAREA_KANBAN_ORIGENES as readonly string[]).includes(origen);
}
