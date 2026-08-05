import { TriangleAlert } from "lucide-react";

import { es } from "@/messages/es";
import { KpiTile } from "@/components/dashboard/charts/kpi-tile";
import { HorizontalBar } from "@/components/dashboard/charts/horizontal-bar";
import { ChartTableFallback } from "@/components/dashboard/charts/chart-table-fallback";
import {
  TimelineList,
  type TimelineListItem,
} from "@/components/dashboard/charts/timeline-list";
import {
  CATEGORICAL_COLORS,
  STATUS_COLORS,
} from "@/components/dashboard/charts/palette";

export interface MiResumenFaceChartRow {
  label: string;
  value: number;
}

/**
 * Mirrors `MiAgendaItem` (`src/lib/dashboard/queries.ts`) structurally rather
 * than importing it — same decoupling convention every other face follows
 * (`TareasFaceChartRow`, `ActividadFaceChartRow`): the presentational layer
 * owns its own prop contract so a query-shape change cannot silently reach
 * into the component.
 */
export interface MiResumenFaceAgendaRow {
  id: number;
  titulo: string;
  fechaLimite: string | null;
  estado: string;
  vencido: boolean;
}

export interface MiResumenFaceProps {
  abiertas: number;
  vencidas: number;
  vencenPronto: number;
  compromisos: number;
  misClientes: number;
  porEstado: MiResumenFaceChartRow[];
  agenda: MiResumenFaceAgendaRow[];
}

/**
 * Mi resumen face presentational component — the fourth face (PRD §7.2 "Cara
 * Mi resumen (vista personal, para cualquier usuario)"). Covers the PRD's three
 * bullets: mis tareas pendientes y vencidas, mis compromisos de clientes, and
 * mis clientes asignados, plus the agenda of what falls due next.
 *
 * Receives already-computed values from `page.tsx` and never fetches — same
 * convention as `PipelineFace`/`ActividadFace`/`TareasFace`. Self-scoping is
 * enforced at the DB layer, not here: both views filter
 * `responsable_id = auth.uid()` / `responsable_interno_id = auth.uid()`
 * (20260803190000_dashboard_mi_resumen_views.sql), so this face has no notion
 * of "whose" data it is showing and cannot leak another user's rows.
 *
 * `porEstado` labels are whatever `estado` strings the view returned — never a
 * hardcoded or mapped list, so a Kanban change to the state set cannot silently
 * drop a bar (same guarantee `TareasFace` documents).
 */
export function MiResumenFace({
  abiertas,
  vencidas,
  vencenPronto,
  compromisos,
  misClientes,
  porEstado,
  agenda,
}: MiResumenFaceProps) {
  const estadoSeries = [
    {
      key: "estado",
      label: es.dashboard.miResumen.charts.porEstado,
      color: CATEGORICAL_COLORS[0],
      data: porEstado,
    },
  ];

  const agendaItems: TimelineListItem[] = agenda.map((row) => ({
    id: row.id,
    // The badge carries the urgency, not the raw estado, when the row is
    // already overdue — an overdue item's estado ("pendiente") is the least
    // useful thing to show about it.
    typeLabel: row.vencido ? es.dashboard.miResumen.agenda.vencida : row.estado,
    title: row.titulo,
    timestampLabel: row.fechaLimite ?? es.dashboard.miResumen.agenda.sinFecha,
  }));

  return (
    <div className="flex flex-col gap-6" data-slot="mi-resumen-face">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          label={es.dashboard.miResumen.kpis.abiertas}
          value={abiertas}
        />
        <KpiTile
          label={es.dashboard.miResumen.kpis.vencidas}
          value={vencidas}
          // Reserved status meaning applies only while there IS overdue work
          // (design.md §5 Decision 6) — a genuine zero is not a critical event,
          // so the badge+icon are withheld rather than alarming the viewer over
          // nothing. Identical judgment call to `TareasFace`.
          status={vencidas > 0 ? "destructivo" : undefined}
          statusLabel={
            vencidas > 0 ? es.dashboard.miResumen.kpis.vencidasBadge : undefined
          }
          icon={vencidas > 0 ? TriangleAlert : undefined}
        />
        <KpiTile
          label={es.dashboard.miResumen.kpis.vencenPronto}
          value={vencenPronto}
        />
        <KpiTile
          label={es.dashboard.miResumen.kpis.compromisos}
          value={compromisos}
        />
        <KpiTile
          label={es.dashboard.miResumen.kpis.misClientes}
          value={misClientes}
        />
      </div>

      {/*
        PRD §1.2 "el sistema guía, no interroga" and "lenguaje humano": the
        compromisos tile counts only CRM-origin records while the other tiles
        span every origen (`sumMisCompromisos` vs `sumMisTareasAbiertas`), so
        the tiles deliberately do not add up. Stating that on screen is cheaper
        than letting a user quietly conclude the numbers are wrong.
      */}
      <p
        className="text-sm text-muted-foreground"
        data-testid="mi-resumen-ayuda"
      >
        {es.dashboard.miResumen.ayuda}
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.miResumen.charts.porEstado}
        </h2>
        <ChartTableFallback
          columns={[
            { key: "label", label: es.dashboard.miResumen.charts.porEstado },
            { key: "value", label: "#" },
          ]}
          rows={porEstado.map((row) => ({
            label: row.label,
            value: row.value,
          }))}
        >
          <HorizontalBar series={estadoSeries} />
        </ChartTableFallback>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {es.dashboard.miResumen.agenda.titulo}
        </h2>
        {agenda.length === 0 ? (
          // Deliberately NOT TimelineList's own empty state: that primitive
          // falls back to the generic `charts.emptyState` ("No hay datos para
          // mostrar"), which reads like a failure. For a personal view, "no
          // tenés tareas con fecha próxima" is the accurate — and reassuring —
          // reading of the same zero (PRD §1.2 lenguaje humano).
          <p
            className="text-sm text-muted-foreground"
            data-testid="mi-resumen-agenda-empty"
          >
            {es.dashboard.miResumen.agenda.emptyState}
          </p>
        ) : (
          <TimelineList items={agendaItems} />
        )}
      </section>
    </div>
  );
}
