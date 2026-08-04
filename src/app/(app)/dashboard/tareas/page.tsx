import type { Metadata } from "next";

import { es } from "@/messages/es";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import {
  getTareasEstado,
  getTareasResponsable,
  getTareasThroughput,
  sumTareasVencidas,
  topResponsablesWithOtros,
  OTROS_RESPONSABLE_ID,
} from "@/lib/dashboard/queries";
import { TareasFace } from "./tareas-face";

export const metadata: Metadata = {
  title: `${es.dashboard.tabs.tareas} · ${es.dashboard.title} · ${es.common.appName}`,
};

/**
 * Tareas face (task 4.6, design.md §3 Decision 4, spec dashboard-tareas).
 * Server-component fetch: 3 separate reads (`getTareasEstado`,
 * `getTareasResponsable`, `getTareasThroughput`) — each is its own
 * `security_invoker` aggregation view, so there is no single combined
 * fetch to share (unlike Actividad's one windowed UNION view) — plus the
 * usuario directory to resolve responsable names. Every derived metric
 * (overdue total, top-N responsables + Otros) is a PURE function over
 * these already-summed rows (design.md §7 "avoid N+1"), never a per-metric
 * round trip. A viewer lacking both `crm.ver` and `kanban.ver` renders every
 * tile/chart in its empty/zero state, never an error, same convention as
 * every other dashboard face.
 */
export default async function TareasPage() {
  const [estadoRows, responsableRows, throughputRows, directory] =
    await Promise.all([
      getTareasEstado(),
      getTareasResponsable(),
      getTareasThroughput(),
      getUsuarioDirectory(),
    ]);

  const vencidasTotal = sumTareasVencidas(estadoRows);

  const estadoPorEstado = estadoRows.map((row) => ({
    label: row.estado,
    value: row.tareas,
  }));

  const throughputSemanal = throughputRows.map((row) => ({
    label: row.semana,
    value: row.cumplidas,
  }));

  const responsablePorResponsable = topResponsablesWithOtros(
    responsableRows,
  ).map((row) => ({
    label:
      row.responsableId === OTROS_RESPONSABLE_ID
        ? es.dashboard.charts.otros
        : resolveUsuarioLabel(directory, row.responsableId),
    abiertas: row.abiertas,
    vencidas: row.vencidas,
  }));

  return (
    <TareasFace
      vencidasTotal={vencidasTotal}
      estadoPorEstado={estadoPorEstado}
      throughputSemanal={throughputSemanal}
      responsablePorResponsable={responsablePorResponsable}
    />
  );
}
