"use client";

import { useState } from "react";

import { es } from "@/messages/es";
import { cn } from "@/lib/utils";

export interface LineAreaPoint {
  label: string;
  value: number;
}

interface LineAreaProps {
  data: LineAreaPoint[];
  /**
   * Caller-supplied note (e.g. "Aproximado" for the Tareas throughput
   * chart, design.md §4.2/§5). This primitive never hardcodes that copy —
   * the owning face imports its own string from `es.ts`.
   */
  approximateLabel?: string;
  className?: string;
}

const CHART_WIDTH = 100;
const CHART_HEIGHT = 40;
const MARKER_RADIUS = 3; // rendered at 2x via stroke, meets the >=8px visual diameter with padding

/**
 * Line/area-over-time primitive (PR-1 task 1.8; design.md §5 Decision 5).
 * Inline SVG, 2px line, markers per weekly bucket, crosshair tooltip on
 * marker hover, empty state.
 */
export function LineArea({ data, approximateLabel, className }: LineAreaProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="line-area-empty"
      >
        {es.dashboard.charts.emptyState}
      </p>
    );
  }

  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? CHART_WIDTH / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    ...d,
    x: data.length > 1 ? i * stepX : CHART_WIDTH / 2,
    y: CHART_HEIGHT - (d.value / maxValue) * CHART_HEIGHT,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="line-area">
      <svg
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        style={{ height: CHART_HEIGHT * 3 }}
      >
        <path
          data-testid="line-area-line"
          d={linePath}
          fill="none"
          stroke="var(--color-rose-500)"
          strokeWidth={2}
        />
        {points.map((p, i) => (
          <circle
            key={p.label}
            data-testid={`line-area-marker-${p.label}`}
            cx={p.x}
            cy={p.y}
            r={MARKER_RADIUS}
            fill="var(--color-rose-500)"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}
      </svg>

      <div className="flex justify-between text-xs text-muted-foreground">
        {points.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>

      {approximateLabel ? (
        <p
          data-testid="line-area-approximate-note"
          className="text-xs text-muted-foreground italic"
        >
          {approximateLabel}
        </p>
      ) : null}

      {hovered ? (
        <div
          data-testid="line-area-tooltip"
          role="tooltip"
          className="w-fit rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sh-1"
        >
          {hovered.label}: {hovered.value}
        </div>
      ) : null}
    </div>
  );
}
