import type { Metadata } from "next";

import { es } from "@/messages/es";
import { resolveUsuarioLabel } from "@/lib/admin/directory";
import { loadBoardView } from "@/lib/kanban/board-data";
import type { SearchParamsRecord } from "@/lib/kanban/filtros";
import {
  SIN_PRIORIDAD,
  SIN_RESPONSABLE,
  buildReporte,
  type DistribucionItem,
} from "@/lib/kanban/reportes";
import { BoardFilters } from "../board-filters";
import { ScopeToggle } from "../scope-toggle";
import { KanbanViewTabs, REPORTES_PATH } from "../view-tabs";
import {
  DistribucionCard,
  type DistribucionCardItem,
} from "./distribucion-card";

export const metadata: Metadata = {
  title: `${es.kanban.reportes.nav} · ${es.kanban.title} · ${es.common.appName}`,
};

interface ReportesPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

const ESTADO_LABELS: Record<string, string> = es.kanban.reportes.estados;

/**
 * Resolves bucket keys to display labels.
 *
 * An unknown key keeps its raw value rather than disappearing or rendering as
 * "—": a code the catalog no longer lists is a real data state, and the same
 * honesty the list view applies to a deactivated `columna` applies here.
 */
function toCardItems(
  items: DistribucionItem[],
  label: (clave: string) => string,
): DistribucionCardItem[] {
  return items.map((item) => ({
    clave: item.clave,
    etiqueta: label(item.clave),
    total: item.total,
  }));
}

/**
 * On-screen board reports (slice 8, spec KR1/KR2, design D8).
 *
 * Shares `loadBoardView` with the board and the list, so the reports count
 * exactly the rows those two views render, under the same filters and the
 * same Mi tablero / Equipo completo scope (KV2). Every figure is derived in
 * `buildReporte` — pure TypeScript, no SQL aggregation, no new view.
 *
 * There is no export control, by design (KR2): `kanban.exportar` is seeded but
 * unenforced in v1, and shipping a download here would offer a capability the
 * permission model does not yet gate. No new npm dependency either.
 */
export default async function KanbanReportesPage({
  searchParams,
}: ReportesPageProps) {
  const params = await searchParams;
  const {
    filters,
    tareas,
    directory,
    usuarioOptions,
    prioridadOptions,
    etiquetaOptions,
    clienteOptions,
  } = await loadBoardView(params);

  const reporte = buildReporte(tareas);

  const etiquetaLabels = new Map(
    etiquetaOptions.map((option) => [option.codigo, option.etiqueta]),
  );
  const prioridadLabels = new Map(
    prioridadOptions.map((option) => [option.codigo, option.etiqueta]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.kanban.reportes.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <KanbanViewTabs current={REPORTES_PATH} params={params} />
          <ScopeToggle
            scope={filters.scope}
            params={params}
            basePath={REPORTES_PATH}
          />
        </div>
      </div>

      <BoardFilters
        values={filters}
        params={params}
        basePath={REPORTES_PATH}
        usuarioOptions={usuarioOptions}
        prioridadOptions={prioridadOptions}
        etiquetaOptions={etiquetaOptions}
        clienteOptions={clienteOptions}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <DistribucionCard
          titulo={es.kanban.reportes.total}
          items={[
            {
              clave: "total",
              etiqueta: es.kanban.reportes.total,
              total: reporte.total,
            },
            {
              clave: "vencidas",
              etiqueta: es.kanban.reportes.vencidas,
              total: reporte.vencidas,
            },
          ]}
        />
        <DistribucionCard
          titulo={es.kanban.reportes.porEstado}
          items={toCardItems(
            reporte.porEstado,
            (clave) => ESTADO_LABELS[clave] ?? clave,
          )}
        />
        <DistribucionCard
          titulo={es.kanban.reportes.porResponsable}
          items={toCardItems(reporte.porResponsable, (clave) =>
            clave === SIN_RESPONSABLE
              ? es.kanban.reportes.sinResponsable
              : resolveUsuarioLabel(directory, clave),
          )}
        />
        <DistribucionCard
          titulo={es.kanban.reportes.porPrioridad}
          items={toCardItems(reporte.porPrioridad, (clave) =>
            clave === SIN_PRIORIDAD
              ? es.kanban.reportes.sinPrioridad
              : (prioridadLabels.get(clave) ?? clave),
          )}
        />
        <DistribucionCard
          titulo={es.kanban.reportes.porEtiqueta}
          ayuda={es.kanban.reportes.etiquetaAyuda}
          items={toCardItems(
            reporte.porEtiqueta,
            (clave) => etiquetaLabels.get(clave) ?? clave,
          )}
        />
      </div>
    </div>
  );
}
