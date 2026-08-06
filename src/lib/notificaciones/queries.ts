import { createClient } from "@/lib/supabase/server";
import {
  ESTADOS_ACTIVOS,
  classify,
  horizonFrom,
  type VencimientoItem,
} from "@/lib/notificaciones/vencimiento";

/**
 * The caller's own due and nearly-due tareas (slice 10, NB7).
 *
 * Reads `v_tarea` — already `security_invoker`, so RLS decides visibility —
 * and adds NO new database object. There is no `notificacion` event table by
 * design: an alert is a QUERY over live rows, not a stored event that has to
 * be created, updated and expired in step with the tarea it describes.
 *
 * The estado filter is `.in('estado', ESTADOS_ACTIVOS)`, spelled out, and
 * never a `vencido=true` filter. Filtering on the view's own column would drag
 * past-due `borrador` rows into the bell — the exact thing `classify` refuses
 * to do (correction C10). Both halves of this function agree because they use
 * the same constant.
 */
export async function getVencimientos(
  usuarioId: string,
  now: Date = new Date(),
): Promise<VencimientoItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_tarea")
    .select("id, titulo, fecha_limite, estado, origen, cliente_id")
    .eq("responsable_id", usuarioId)
    .in("estado", ESTADOS_ACTIVOS)
    .not("fecha_limite", "is", null)
    .lte("fecha_limite", horizonFrom(now).toISOString())
    .order("fecha_limite", { ascending: true });

  const items: VencimientoItem[] = [];

  for (const row of data ?? []) {
    // The query narrows; `classify` decides. Re-running it here is not
    // redundant — it is what keeps the bell, the board badge and the digest
    // partitioning identical rows identically, instead of three call sites
    // each reimplementing the boundary in SQL.
    const estado = classify(
      { estado: row.estado, fechaLimite: row.fecha_limite },
      now,
    );

    if (estado === null) {
      continue;
    }

    items.push({
      id: row.id,
      titulo: row.titulo,
      fechaLimite: row.fecha_limite,
      estado,
      origen: row.origen,
      clienteId: row.cliente_id,
    });
  }

  return items;
}

/**
 * How many items the bell should show.
 *
 * Derived from the same list rather than a `head: true` count query: a count
 * that disagreed with the list it labels is worse than a slightly heavier
 * read, and the list is bounded by one user's 72-hour window.
 */
export async function countVencimientos(
  usuarioId: string,
  now: Date = new Date(),
): Promise<number> {
  const items = await getVencimientos(usuarioId, now);
  return items.length;
}
