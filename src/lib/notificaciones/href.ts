import type { VencimientoItem } from "@/lib/notificaciones/vencimiento";

/**
 * Where a bell item takes the user (slice 10, NB4, open question N5 closed).
 *
 * A CRM-side row goes to the client's Compromisos tab, not to the board: that
 * is where its context lives — the cliente, the other compromisos, the
 * bitácora. A row that is on the board only, or a CRM row with no cliente
 * attached to land on, goes to the tarea detail.
 *
 * `'Ambos'` deliberately routes to CRM. A promoted compromiso exists in both
 * places, and the CRM side is the one that explains WHY the task exists.
 */
export function hrefFor(
  item: Pick<VencimientoItem, "id" | "origen" | "clienteId">,
): string {
  const esCrm = item.origen === "CRM" || item.origen === "Ambos";

  if (esCrm && item.clienteId !== null) {
    return `/crm/${item.clienteId}/compromisos`;
  }

  return `/kanban/${item.id}`;
}
