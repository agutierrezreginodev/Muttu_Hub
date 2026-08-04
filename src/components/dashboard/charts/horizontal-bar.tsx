"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { cn } from "@/lib/utils";

export interface HorizontalBarSeries {
  key: string;
  label: string;
  color: string;
  data: Array<{ label: string; value: number }>;
}

interface HorizontalBarProps {
  series: HorizontalBarSeries[];
  className?: string;
  /**
   * Formats a raw value for the direct label and hover tooltip (task 2.8,
   * spec dashboard-pipeline "the value chart's bars are labeled in COP").
   * Bar WIDTH always uses the raw numeric `value` — this only changes the
   * displayed text. Defaults to the plain number (PR-1 behavior, unchanged
   * for every existing caller that doesn't pass it).
   */
  formatValue?: (value: number) => string;
}

interface HoverState {
  categoryLabel: string;
  seriesLabel: string;
  value: number;
}

const ROW_HEIGHT = 28;
const BAR_HEIGHT = 16;
const CHART_WIDTH = 100; // percentage-based, viewBox is unitless 0-100

/**
 * Horizontal bar primitive (PR-1 task 1.6; design.md §5 Decision 5). Inline
 * SVG, single-series → no legend + direct value labels; ≥2 series → legend,
 * grouped bars per category. Marks use 4px rounded ends (rx="4"). Bars keep
 * the order given in `series[0].data` — the caller (query layer) is
 * responsible for catalog ordering; this primitive never re-sorts.
 */
export function HorizontalBar({
  series,
  className,
  formatValue,
}: HorizontalBarProps) {
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const format = formatValue ?? ((value: number) => String(value));

  const hasData = series.some((s) => s.data.length > 0);
  if (!hasData) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="horizontal-bar-empty"
      >
        {es.dashboard.charts.emptyState}
      </p>
    );
  }

  const categories = series[0]?.data.map((d) => d.label) ?? [];
  const maxValue = Math.max(
    1,
    ...series.flatMap((s) => s.data.map((d) => d.value)),
  );
  const isSingleSeries = series.length === 1;
  const perSeriesHeight = BAR_HEIGHT / series.length;

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="horizontal-bar"
    >
      {!isSingleSeries ? (
        <div
          data-testid="horizontal-bar-legend"
          className="flex flex-wrap gap-3 text-xs text-muted-foreground"
        >
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <svg
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${categories.length * ROW_HEIGHT}`}
        className="w-full"
        style={{ height: categories.length * ROW_HEIGHT }}
      >
        {categories.map((categoryLabel, rowIndex) => (
          <g key={categoryLabel}>
            {series.map((s, seriesIndex) => {
              const value = s.data[rowIndex]?.value ?? 0;
              const barWidth = (value / maxValue) * (CHART_WIDTH - 20);
              const y =
                rowIndex * ROW_HEIGHT +
                (ROW_HEIGHT - BAR_HEIGHT) / 2 +
                seriesIndex * perSeriesHeight;
              const testId = isSingleSeries
                ? `horizontal-bar-mark-${categoryLabel}`
                : `horizontal-bar-mark-${s.key}-${categoryLabel}`;

              return (
                <rect
                  key={testId}
                  data-testid={testId}
                  x={0}
                  y={y}
                  width={Math.max(barWidth, 0)}
                  height={perSeriesHeight}
                  rx={4}
                  fill={s.color}
                  onMouseEnter={() =>
                    setHovered({ categoryLabel, seriesLabel: s.label, value })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
            {isSingleSeries ? (
              <text
                x={
                  (Math.max(series[0]?.data[rowIndex]?.value ?? 0, 0) /
                    maxValue) *
                    (CHART_WIDTH - 20) +
                  2
                }
                y={rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + 3}
                fontSize={7}
                fill="var(--color-ink-700)"
              >
                {format(series[0]?.data[rowIndex]?.value ?? 0)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      {hovered ? (
        <div
          data-testid="horizontal-bar-tooltip"
          role="tooltip"
          className="w-fit rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sh-1"
        >
          {hovered.categoryLabel}
          {!isSingleSeries ? ` · ${hovered.seriesLabel}` : ""}:{" "}
          {format(hovered.value)}
        </div>
      ) : null}
    </div>
  );
}
