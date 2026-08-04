import type { Metadata } from "next";

import { es } from "@/messages/es";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import {
  countActividadNuevos,
  formatActividadRelativeTime,
  getActividadWindow,
  getClienteNombreMap,
  groupActividadPorSemana,
  limitActividadFeed,
  OTROS_CLIENTE_ID,
  topClientesActivos,
  type ActividadTipo,
} from "@/lib/dashboard/queries";
import { ActividadFace } from "./actividad-face";

export const metadata: Metadata = {
  title: `${es.dashboard.tabs.actividad} · ${es.dashboard.title} · ${es.common.appName}`,
};

const TIPO_LABELS: Record<ActividadTipo, string> = {
  bitacora: es.dashboard.actividad.tipos.bitacora,
  contacto_nuevo: es.dashboard.actividad.tipos.contacto_nuevo,
  oportunidad_nueva: es.dashboard.actividad.tipos.oportunidad_nueva,
  oportunidad_gestion: es.dashboard.actividad.tipos.oportunidad_gestion,
};

/**
 * Actividad Clientes face (task 3.6, design.md §3 Decision 4, spec
 * dashboard-actividad). Server-component fetch: ONE windowed read of
 * `v_actividad_cliente` (`getActividadWindow`, default 30 days) plus the two
 * lookup maps (cliente names, usuario directory) needed to resolve display
 * labels — every derived metric (feed slice, weekly volume, most-active
 * clientes, new-count tiles) is then a PURE function over that single result
 * set (design.md §4.3/§7 "avoid N+1"), never a per-metric round trip. A
 * viewer without `crm.ver` renders every tile/chart/feed in its empty/zero
 * state, never an error, same convention as the Pipeline face.
 */
export default async function ActividadPage() {
  const [rows, clienteNombres, directory] = await Promise.all([
    getActividadWindow(),
    getClienteNombreMap(),
    getUsuarioDirectory(),
  ]);

  const nuevos = countActividadNuevos(rows);

  const volumenSemanal = groupActividadPorSemana(rows).map((row) => ({
    label: row.semana,
    value: row.eventos,
  }));

  const clientesActivos = topClientesActivos(rows).map((row) => ({
    label:
      row.clienteId === OTROS_CLIENTE_ID
        ? es.dashboard.charts.otros
        : (clienteNombres.get(row.clienteId) ?? "—"),
    value: row.eventos,
  }));

  const feed = limitActividadFeed(rows).map((row, index) => ({
    id: `${row.tipo}-${index}`,
    typeLabel: TIPO_LABELS[row.tipo],
    title: row.detalle,
    subtitle: `${clienteNombres.get(row.clienteId) ?? "—"} · ${resolveUsuarioLabel(directory, row.actorId)}`,
    timestampLabel: formatActividadRelativeTime(row.ocurridoEn),
  }));

  return (
    <ActividadFace
      nuevosContactos={nuevos.nuevosContactos}
      nuevasOportunidades={nuevos.nuevasOportunidades}
      feed={feed}
      volumenSemanal={volumenSemanal}
      clientesActivos={clientesActivos}
    />
  );
}
