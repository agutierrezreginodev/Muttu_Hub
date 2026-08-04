import { es } from "@/messages/es";
import { KpiTile } from "@/components/dashboard/charts/kpi-tile";
import { HorizontalBar } from "@/components/dashboard/charts/horizontal-bar";
import { LineArea } from "@/components/dashboard/charts/line-area";
import {
  TimelineList,
  type TimelineListItem,
} from "@/components/dashboard/charts/timeline-list";
import { ChartTableFallback } from "@/components/dashboard/charts/chart-table-fallback";
import { CATEGORICAL_COLORS } from "@/components/dashboard/charts/palette";

export interface ActividadFaceChartRow {
  label: string;
  value: number;
}

export interface ActividadFaceProps {
  nuevosContactos: number;
  nuevasOportunidades: number;
  feed: TimelineListItem[];
  volumenSemanal: ActividadFaceChartRow[];
  clientesActivos: ActividadFaceChartRow[];
}

/**
 * Actividad Clientes face presentational component (task 3.6, design.md §5,
 * spec dashboard-actividad). Receives already-computed rows from
 * `page.tsx` — never fetches itself, same convention as `PipelineFace`. The
 * recent-activity feed is a plain `TimelineList` (design's own chart-type
 * mapping: "timeline list — not a chart"), so it renders WITHOUT a
 * `ChartTableFallback` wrapper, same as the KPI tiles above it — only the
 * two genuine charts (weekly volume, most-active clientes) get the
 * table-view fallback, matching spec dashboard-actividad's literal
 * "table-view fallback of every CHARTED series" wording.
 */
export function ActividadFace({
  nuevosContactos,
  nuevasOportunidades,
  feed,
  volumenSemanal,
  clientesActivos,
}: ActividadFaceProps) {
  const clientesActivosSeries = [
    {
      key: "clientesActivos",
      label: es.dashboard.actividad.charts.clientesActivos,
      color: CATEGORICAL_COLORS[0],
      data: clientesActivos,
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-slot="actividad-face">
      <p className="text-xs text-muted-foreground">
        {es.dashboard.actividad.ventana}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile
          label={es.dashboard.actividad.kpis.nuevosContactos}
          value={nuevosContactos}
        />
        <KpiTile
          label={es.dashboard.actividad.kpis.nuevasOportunidades}
          value={nuevasOportunidades}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.actividad.charts.volumenSemanal}
        </h2>
        <ChartTableFallback
          columns={[
            {
              key: "label",
              label: es.dashboard.actividad.charts.volumenSemanal,
            },
            { key: "value", label: "#" },
          ]}
          rows={volumenSemanal.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <LineArea data={volumenSemanal} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.actividad.charts.clientesActivos}
        </h2>
        <ChartTableFallback
          columns={[
            {
              key: "label",
              label: es.dashboard.actividad.charts.clientesActivos,
            },
            { key: "value", label: "#" },
          ]}
          rows={clientesActivos.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <HorizontalBar series={clientesActivosSeries} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.actividad.charts.feedTitle}
        </h2>
        <TimelineList items={feed} />
      </section>
    </div>
  );
}
