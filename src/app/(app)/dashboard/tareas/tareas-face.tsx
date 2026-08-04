import { TriangleAlert } from "lucide-react";

import { es } from "@/messages/es";
import { KpiTile } from "@/components/dashboard/charts/kpi-tile";
import { HorizontalBar } from "@/components/dashboard/charts/horizontal-bar";
import { LineArea } from "@/components/dashboard/charts/line-area";
import { ChartTableFallback } from "@/components/dashboard/charts/chart-table-fallback";
import {
  CATEGORICAL_COLORS,
  STATUS_COLORS,
} from "@/components/dashboard/charts/palette";

export interface TareasFaceChartRow {
  label: string;
  value: number;
}

export interface TareasFaceResponsableRow {
  label: string;
  abiertas: number;
  vencidas: number;
}

export interface TareasFaceProps {
  vencidasTotal: number;
  estadoPorEstado: TareasFaceChartRow[];
  throughputSemanal: TareasFaceChartRow[];
  responsablePorResponsable: TareasFaceResponsableRow[];
}

/**
 * Tareas face presentational component (task 4.6, design.md §5, spec
 * dashboard-tareas). Receives already-computed rows from `page.tsx` — never
 * fetches itself, same convention as `PipelineFace`/`ActividadFace`. Ships
 * exactly the spec's formal Requirements (overdue tile, estado bar,
 * throughput chart, per-responsable bar, empty states) — design.md §5's
 * table also lists "total open"/"completed-period" stat tiles as candidate
 * headlines, but those are NOT formal spec requirements; deferred as a
 * disclosed judgment call, mirroring `PipelineFace`'s own precedent of
 * shipping exactly what spec.md requires over the design table's suggestive
 * extras.
 *
 * `estadoPorEstado`'s labels are whatever `estado` strings `page.tsx` read
 * from the view — this component never hardcodes/maps estado codes (spec:
 * "read from the data, not hardcoded, so a Kanban change to the state set
 * does not silently drop a bar").
 */
export function TareasFace({
  vencidasTotal,
  estadoPorEstado,
  throughputSemanal,
  responsablePorResponsable,
}: TareasFaceProps) {
  const estadoSeries = [
    {
      key: "estado",
      label: es.dashboard.tareas.charts.porEstado,
      color: CATEGORICAL_COLORS[0],
      data: estadoPorEstado,
    },
  ];

  const responsableSeries = [
    {
      key: "abiertas",
      label: es.dashboard.tareas.charts.abiertas,
      color: CATEGORICAL_COLORS[0],
      data: responsablePorResponsable.map((row) => ({
        label: row.label,
        value: row.abiertas,
      })),
    },
    {
      key: "vencidas",
      label: es.dashboard.tareas.charts.vencidas,
      color: STATUS_COLORS.destructivo.fg,
      data: responsablePorResponsable.map((row) => ({
        label: row.label,
        value: row.vencidas,
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-slot="tareas-face">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label={es.dashboard.tareas.kpis.vencidas}
          value={vencidasTotal}
          // Reserved status meaning only applies while there IS overdue
          // work (design.md §5 Decision 6) — a genuine zero is not a
          // critical/serious event, so the badge+icon are withheld rather
          // than alarming the viewer over nothing (disclosed judgment
          // call, spec dashboard-tareas' "empty ... no error" scenario).
          status={vencidasTotal > 0 ? "destructivo" : undefined}
          statusLabel={
            vencidasTotal > 0 ? es.dashboard.tareas.charts.vencidas : undefined
          }
          icon={vencidasTotal > 0 ? TriangleAlert : undefined}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.tareas.charts.porEstado}
        </h2>
        <ChartTableFallback
          columns={[
            { key: "label", label: es.dashboard.tareas.charts.porEstado },
            { key: "value", label: "#" },
          ]}
          rows={estadoPorEstado.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <HorizontalBar series={estadoSeries} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.tareas.charts.throughput}
        </h2>
        <ChartTableFallback
          columns={[
            { key: "label", label: es.dashboard.tareas.charts.throughput },
            { key: "value", label: "#" },
          ]}
          rows={throughputSemanal.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <LineArea
            data={throughputSemanal}
            approximateLabel={es.dashboard.tareas.charts.throughputAproximado}
          />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.tareas.charts.porResponsable}
        </h2>
        <ChartTableFallback
          columns={[
            { key: "label", label: es.dashboard.tareas.charts.porResponsable },
            { key: "abiertas", label: es.dashboard.tareas.charts.abiertas },
            { key: "vencidas", label: es.dashboard.tareas.charts.vencidas },
          ]}
          rows={responsablePorResponsable.map((row) => ({
            label: row.label,
            abiertas: row.abiertas,
            vencidas: row.vencidas,
          }))}
        >
          <HorizontalBar series={responsableSeries} />
        </ChartTableFallback>
      </section>
    </div>
  );
}
