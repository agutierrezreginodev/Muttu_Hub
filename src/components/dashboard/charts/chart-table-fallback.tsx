"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChartTableFallbackColumn {
  key: string;
  label: string;
}

interface ChartTableFallbackProps {
  columns: ChartTableFallbackColumn[];
  rows: Array<Record<string, string | number>>;
  children: React.ReactNode;
  className?: string;
}

/**
 * Generic chart/table toggle wrapper (PR-1 task 1.10; design.md §5 —
 * every chart ships with a table-view fallback with parity to the charted
 * series). Wraps a chart primitive (`children`) and, on toggle, renders an
 * equivalent `<table>` built from the SAME `rows`/`columns` the chart was
 * given — guaranteeing parity by construction (one shared data source, two
 * views), not by hand-kept sync between chart and table.
 */
export function ChartTableFallback({
  columns,
  rows,
  children,
  className,
}: ChartTableFallbackProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="chart-table-fallback"
    >
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTable((prev) => !prev)}
        >
          {showTable
            ? es.dashboard.charts.chartViewToggle
            : es.dashboard.charts.tableViewToggle}
        </Button>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">
            {es.dashboard.charts.tableCaption}
          </caption>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-border px-2 py-1 text-left"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="border-b border-border px-2 py-1"
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </div>
  );
}
