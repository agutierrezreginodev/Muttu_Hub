import type { Metadata } from "next";

import { es } from "@/messages/es";
import { getCatalogoOptions, resolveCatalogoLabel } from "@/lib/crm/catalogos";
import {
  getPipelineEstado,
  getPipelineServicio,
  getPipelineTotales,
  OTROS_SERVICIO_CODE,
  settledOr,
  topNServicioWithOtros,
} from "@/lib/dashboard/queries";
import { PipelineFace } from "./pipeline-face";

export const metadata: Metadata = {
  title: `${es.dashboard.tabs.pipeline} · ${es.dashboard.title} · ${es.common.appName}`,
};

/**
 * Pipeline face — default `/dashboard` landing route (task 2.8, design.md
 * §3 Decision 4, spec dashboard-pipeline). Server-component fetch via
 * `Promise.allSettled` over the three aggregation views (+ the catalog map,
 * for estado/servicio display labels) — the SAME "ignore error, ready-to-
 * render rows" convention `(app)/crm/page.tsx` already uses; a viewer
 * without `crm.ver` renders every tile/chart in its empty/zero state, never
 * an error (spec: "dashboard.ver but no crm.ver sees zeros, not an error").
 * `allSettled` + `settledOr` (bug fix) means a single REJECTED fetch
 * degrades only its own slot instead of throwing the whole face to Next's
 * error boundary.
 */
export default async function DashboardPage() {
  const [estadoResult, totalesResult, servicioResult, catalogoMapResult] =
    await Promise.allSettled([
      getPipelineEstado(),
      getPipelineTotales(),
      getPipelineServicio(),
      getCatalogoOptions(),
    ]);

  const estado = settledOr(estadoResult, []);
  const totales = settledOr(totalesResult, {
    abiertas: 0,
    valorAbiertas: 0,
    total: 0,
    pendingClassification: true as const,
  });
  const servicio = settledOr(servicioResult, []);
  const catalogoMap = settledOr(catalogoMapResult, new Map());

  const estadoCount = estado.map((row) => ({
    label: resolveCatalogoLabel(catalogoMap, "estado_oportunidad", row.estado),
    value: row.oportunidades,
  }));
  const estadoValor = estado.map((row) => ({
    label: resolveCatalogoLabel(catalogoMap, "estado_oportunidad", row.estado),
    value: row.valorTotal,
  }));
  const servicioRows = topNServicioWithOtros(servicio).map((row) => ({
    label:
      row.servicioCodigo === OTROS_SERVICIO_CODE
        ? es.dashboard.charts.otros
        : resolveCatalogoLabel(
            catalogoMap,
            "servicio_interes",
            row.servicioCodigo,
          ),
    value: row.oportunidades,
  }));

  return (
    <PipelineFace
      abiertas={totales.abiertas}
      valorAbiertas={totales.valorAbiertas}
      estadoCount={estadoCount}
      estadoValor={estadoValor}
      servicio={servicioRows}
    />
  );
}
