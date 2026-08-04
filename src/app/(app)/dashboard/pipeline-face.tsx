import { es } from "@/messages/es";
import { KpiTile } from "@/components/dashboard/charts/kpi-tile";
import { HorizontalBar } from "@/components/dashboard/charts/horizontal-bar";
import { ChartTableFallback } from "@/components/dashboard/charts/chart-table-fallback";
import { CATEGORICAL_COLORS } from "@/components/dashboard/charts/palette";

export interface PipelineFaceChartRow {
  label: string;
  value: number;
}

export interface PipelineFaceProps {
  abiertas: number;
  valorAbiertas: number;
  estadoCount: PipelineFaceChartRow[];
  estadoValor: PipelineFaceChartRow[];
  servicio: PipelineFaceChartRow[];
}

/** COP headline formatting (spec dashboard-pipeline: "formatted in COP for the value tile"). */
function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Pipeline face presentational component (task 2.8, design.md §5, spec
 * dashboard-pipeline). Receives already-summed rows from `page.tsx`'s
 * `Promise.all` fetch — never fetches itself. Conversion ships as the
 * "pendiente de clasificación" state ONLY (CONFIRMED PRODUCT DECISION: no
 * won/lost estado classification exists yet — see
 * `src/lib/dashboard/queries.ts`'s `PipelineTotales.pendingClassification`).
 * That marker is deliberately NOT a prop here: it can only ever be `true`, so
 * passing it in would imply this component branches on it when it does not.
 * Count and value are two SEPARATE horizontal-bar charts (one-axis rule,
 * spec "Valor por estado (COP) chart" — never a shared dual y-axis).
 */
export function PipelineFace({
  abiertas,
  valorAbiertas,
  estadoCount,
  estadoValor,
  servicio,
}: PipelineFaceProps) {
  const countSeries = [
    {
      key: "oportunidades",
      label: es.dashboard.pipeline.charts.porEstadoCount,
      color: CATEGORICAL_COLORS[0],
      data: estadoCount,
    },
  ];
  // COP text is formatted HERE, on the server, and handed to the chart as a
  // plain string per datum. `HorizontalBar` is a client component, so a
  // formatter function cannot be passed to it — React rejects function props at
  // the server/client boundary.
  const valorSeries = [
    {
      key: "valor",
      label: es.dashboard.pipeline.charts.porEstadoValor,
      color: CATEGORICAL_COLORS[1],
      data: estadoValor.map((row) => ({
        ...row,
        displayValue: formatCop(row.value),
      })),
    },
  ];
  const servicioSeries = [
    {
      key: "servicio",
      label: es.dashboard.pipeline.charts.porServicio,
      color: CATEGORICAL_COLORS[2],
      data: servicio,
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-slot="pipeline-face">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label={es.dashboard.pipeline.kpis.abiertas} value={abiertas} />
        <KpiTile
          label={es.dashboard.pipeline.kpis.valorAbiertas}
          value={formatCop(valorAbiertas)}
        />
        <KpiTile
          label={es.dashboard.pipeline.kpis.conversion}
          value={es.dashboard.pipeline.kpis.conversionPendiente}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.pipeline.charts.porEstadoCount}
        </h2>
        <ChartTableFallback
          columns={[
            {
              key: "label",
              label: es.dashboard.pipeline.charts.porEstadoCount,
            },
            { key: "value", label: "#" },
          ]}
          rows={estadoCount.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <HorizontalBar series={countSeries} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.pipeline.charts.porEstadoValor}
        </h2>
        <ChartTableFallback
          columns={[
            {
              key: "label",
              label: es.dashboard.pipeline.charts.porEstadoValor,
            },
            { key: "value", label: "COP" },
          ]}
          rows={estadoValor.map((row) => ({
            label: row.label,
            value: formatCop(row.value),
          }))}
        >
          <HorizontalBar series={valorSeries} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.pipeline.charts.porServicio}
        </h2>
        <ChartTableFallback
          columns={[
            { key: "label", label: es.dashboard.pipeline.charts.porServicio },
            { key: "value", label: "#" },
          ]}
          rows={servicio.map((row) => ({ label: row.label, value: row.value }))}
        >
          <HorizontalBar series={servicioSeries} />
        </ChartTableFallback>
      </section>
    </div>
  );
}
