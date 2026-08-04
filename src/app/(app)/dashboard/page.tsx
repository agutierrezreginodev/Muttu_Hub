import type { Metadata } from "next";

import { es } from "@/messages/es";
import { getCatalogoOptions, resolveCatalogoLabel } from "@/lib/crm/catalogos";
import {
  getPipelineEstado,
  getPipelineServicio,
  getPipelineTotales,
  OTROS_SERVICIO_CODE,
  topNServicioWithOtros,
} from "@/lib/dashboard/queries";
import { PipelineFace } from "./pipeline-face";

export const metadata: Metadata = {
  title: `${es.dashboard.tabs.pipeline} · ${es.dashboard.title} · ${es.common.appName}`,
};

/**
 * Pipeline face — default `/dashboard` landing route (task 2.8, design.md
 * §3 Decision 4, spec dashboard-pipeline). Server-component fetch via
 * `Promise.all` over the three aggregation views (+ the catalog map, for
 * estado/servicio display labels) — the SAME "ignore error, ready-to-render
 * rows" convention `(app)/crm/page.tsx` already uses; a viewer without
 * `crm.ver` renders every tile/chart in its empty/zero state, never an
 * error (spec: "dashboard.ver but no crm.ver sees zeros, not an error").
 */
export default async function DashboardPage() {
  const [estado, totales, servicio, catalogoMap] = await Promise.all([
    getPipelineEstado(),
    getPipelineTotales(),
    getPipelineServicio(),
    getCatalogoOptions(),
  ]);

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
      pendingClassification={totales.pendingClassification}
      estadoCount={estadoCount}
      estadoValor={estadoValor}
      servicio={servicioRows}
    />
  );
}
