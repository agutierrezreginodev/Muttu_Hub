import type { Metadata } from "next";

import { es } from "@/messages/es";
import { getSessionContext } from "@/lib/session/get-session-context";
import {
  getMiAgenda,
  getMiResumenTareas,
  getMisClientes,
  groupMiResumenPorEstado,
  settledOr,
  sumMisCompromisos,
  sumMisTareasAbiertas,
  sumMisTareasVencenPronto,
  sumMisTareasVencidas,
  type MiAgendaItem,
} from "@/lib/dashboard/queries";
import { MiResumenFace } from "./mi-resumen-face";

export const metadata: Metadata = {
  title: `${es.dashboard.tabs.miResumen} · ${es.dashboard.title} · ${es.common.appName}`,
};

/**
 * Mi resumen face (PRD §7.2), the fourth face. Everything below it already
 * existed and was covered before this page did: the two views
 * (`v_dashboard_mi_resumen_tareas`, `v_dashboard_mis_clientes`, with pgTAP in
 * dashboard_mi_resumen_views.sql), the three fetch helpers, and all five pure
 * derivations in `queries.ts`. This page is the presentation layer that was
 * missing — which is why it is a small diff for a whole face.
 *
 * `getMiAgenda` is the one fetch needing an explicit argument: it reads
 * `v_tarea` directly rather than a dedicated aggregation view, so the caller's
 * own id has to be passed in. `getSessionContext()` supplies it, the same way
 * `getProximoCompromiso` already takes an explicit id in CRM.
 *
 * Every other read is self-scoping at the DB layer (`auth.uid()` inside the
 * view), so a missing session degrades the agenda slot alone — the headline
 * tiles still render their real values.
 *
 * `Promise.allSettled` + `settledOr` from the outset (not retrofitted): one
 * rejected fetch degrades only its own slot instead of throwing the whole face
 * to Next's error boundary, and each failure leaves a log line naming the
 * query.
 */
export default async function MiResumenPage() {
  const session = await getSessionContext();

  const [resumenResult, clientesResult, agendaResult] =
    await Promise.allSettled([
      getMiResumenTareas(),
      getMisClientes(),
      session
        ? getMiAgenda(session.userId)
        : Promise.resolve<MiAgendaItem[]>([]),
    ]);

  const resumenRows = settledOr(resumenResult, []);
  const misClientes = settledOr(clientesResult, 0);
  const agenda = settledOr(agendaResult, []);

  return (
    <MiResumenFace
      abiertas={sumMisTareasAbiertas(resumenRows)}
      vencidas={sumMisTareasVencidas(resumenRows)}
      vencenPronto={sumMisTareasVencenPronto(resumenRows)}
      compromisos={sumMisCompromisos(resumenRows)}
      misClientes={misClientes}
      porEstado={groupMiResumenPorEstado(resumenRows).map((row) => ({
        label: row.estado,
        value: row.tareas,
      }))}
      agenda={agenda}
    />
  );
}
