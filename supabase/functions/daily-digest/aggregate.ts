import { classify, type VencimientoItem } from "../_shared/vencimiento.ts";

/** The `v_tarea` shape `fetchDueTareas` selects. */
export interface DigestRow {
  id: number;
  titulo: string;
  fecha_limite: string | null;
  estado: string;
  origen: string;
  cliente_id: number | null;
}

/**
 * Turn fetched rows into the digest's items (slice 11a).
 *
 * PURE — no client, no clock of its own, no I/O. `now` is a parameter so a
 * test can freeze it, and so every recipient in one run is classified against
 * the SAME instant rather than drifting as the loop takes time.
 *
 * Delegates the actual decision to `classify`, the canonical model. That is
 * the whole point of this function existing separately from `fetch.ts`: the
 * digest must partition rows exactly as the board badge and the bell do, and
 * the only way to guarantee that is to run the same code rather than a SQL
 * translation of it.
 */
export function aggregate(
  rows: readonly DigestRow[],
  now: Date,
): VencimientoItem[] {
  const items: VencimientoItem[] = [];

  for (const row of rows) {
    const estado = classify(
      { estado: row.estado, fechaLimite: row.fecha_limite },
      now,
    );

    if (estado === null || row.fecha_limite === null) {
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

  // Most urgent first, so the email reads top-down in the order the reader
  // should act.
  return items.sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
}
