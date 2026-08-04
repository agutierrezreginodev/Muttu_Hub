/**
 * Dataviz palette — Dashboard (4 faces), PR-1 (design.md §5, Decision 5/6;
 * tasks 1.1/1.2).
 *
 * CRITICAL CONSTRAINT (explicit user decision, do not deviate): color values
 * are drawn EXCLUSIVELY from the existing Muttu brand tokens already defined
 * in `src/app/globals.css` (`--color-rose-*`, `--color-ink-*`, `--color-teal`,
 * `--color-amarillo`, and the semantic status tokens). No new hue (e.g. the
 * blue/orange seen in outside "Taskeo" reference screenshots) is introduced —
 * those screenshots informed component STRUCTURE only (see design.md §5),
 * never color.
 *
 * All entries reference the CSS custom properties directly (`var(--color-*)`)
 * rather than hardcoded hex, so charts automatically stay in sync with the
 * theme tokens and never drift from `globals.css`. Per the comment on that
 * file's brand scale ("static tokens — identical in light and dark"), every
 * token used below (`rose-*`, `ink-*`, `teal`, `amarillo`) is intentionally
 * theme-invariant, so the categorical/sequential palettes render identically
 * in light and dark. Only the *surface* tokens (canvas/axis/grid) switch by
 * mode, exactly mirroring the existing `--border` alias
 * (`ink-200` light / `ink-800` dark).
 *
 * ---------------------------------------------------------------------------
 * Decision 6 (RED gate) — MANUAL validation, not `validate_palette.js`
 * ---------------------------------------------------------------------------
 * `dataviz/scripts/validate_palette.js` referenced by design.md/tasks.md is a
 * Claude Code SKILL script, not a file that exists inside this repository —
 * confirmed absent (`fd`/`rg` found nothing under `dataviz/`). Skill-tool
 * invocation is unavailable to this executor, so the RED gate is satisfied by
 * REASONING MANUALLY through the same checks the validator would run,
 * directly on the OKLCH values already declared in `globals.css` (OKLCH's `L`
 * channel IS perceptual lightness by construction — this is strictly more
 * precise than round-tripping through hex and re-deriving lightness/chroma).
 *
 * Categorical set chosen (fixed order, never cycled):
 *   1. rose-500  oklch(0.551 0.212 5.5)    — brand primary anchor
 *   2. teal      oklch(0.536 0.089 205.032) — hue-opposite (~200° apart), similar L
 *   3. amarillo  oklch(0.811 0.166 84.963)  — hue between 1 & 2, but MUCH lighter (ΔL ≈ +0.27)
 *   4. rose-300  oklch(0.749 0.136 354.91)  — same hue family as #1, but placed
 *                                             NON-adjacent and with ΔL ≈ +0.20 vs #1
 *   5. ink-600   oklch(0.501 0.028 2.184)   — near-zero chroma anchor (neutral)
 *
 * (a) Lightness band / contrast against both surfaces: L values span
 *     0.501–0.811, all comfortably inside the mid-band away from the extremes
 *     (L≈0.99 canvas, L≈0.19 ink-950), so every mark reads against both
 *     `--color-canvas` (light) and `--color-ink-950` (dark) without washing
 *     out — this mirrors why `--foreground`/`--card` already sit at the
 *     opposite extremes in `globals.css`. Marks additionally always carry a
 *     direct label or legend swatch (never color-only meaning), so text
 *     itself relies on `--foreground`/`--muted-foreground`, which are
 *     independently WCAG-checked elsewhere in the design system — this
 *     palette only needs the MARK to be legible/distinguishable, not to carry
 *     body-text contrast.
 * (b) Adjacent-pair CVD distinguishability: the two closest-hue neighbors by
 *     raw hue angle are teal (205°) and amarillo (85°) — a tritanopia
 *     (blue/yellow) risk pair — but they are placed adjacent (#2, #3)
 *     specifically BECAUSE their lightness gap (ΔL ≈ 0.275) is large, so a
 *     tritanope still separates them by lightness alone. rose-500 (#1) and
 *     rose-300 (#4) share a hue family (a protanopia/deuteranopia risk only if
 *     adjacent) but are deliberately NOT adjacent (separated by #2 and #3) and
 *     differ by ΔL ≈ 0.198, so even recalled-by-memory confusion is guarded by
 *     lightness. ink-600 (#5) is near-zero chroma (C = 0.028 vs C ≥ 0.089 for
 *     every chromatic entry), so it is trivially distinguishable from all
 *     chromatic entries under EVERY CVD type — chroma-vs-neutral is a
 *     lightness/saturation cue, not a hue cue.
 * (c) Status reservation: `exito` / `alerta` / `destructivo` / `info` (and
 *     their `-bg` pairs) are NEVER included in the categorical or sequential
 *     arrays below — they are exported only via `STATUS_COLORS` and MUST be
 *     used exclusively for status meaning (overdue/destructivo, due-soon/
 *     alerta, on-track/exito, informational/info), per design.md §5 and
 *     Decision 6. `getCategoricalColor`/`SEQUENTIAL_COLORS` never resolve to
 *     a status color.
 * (d) Chroma floor: every chromatic categorical entry has C ≥ 0.089 (well
 *     above a "looks gray" floor); the one intentionally-neutral entry
 *     (ink-600, C = 0.028) is neutral BY DESIGN (it is the fixed "last
 *     resort" categorical slot for de-emphasized series), not an accidental
 *     washed-out color.
 *
 * "Top N + Otros" rule (design.md §5 table, "9th+ never a new hue"): once a
 * face aggregates a long tail into "Otros" (query-layer responsibility, not
 * this module's), that bucket ALWAYS renders with `CATEGORICAL_OTHER_COLOR`
 * — a dedicated, lighter neutral (`ink-300`, L = 0.873) chosen to be
 * distinguishable from the `ink-600` categorical slot (#5) by lightness alone
 * if both appear in the same chart. `getCategoricalColor` never invents or
 * cycles a 6th hue; indices beyond the fixed set fall back to the same Otros
 * neutral rather than repeating an earlier hue with a new meaning.
 *
 * Sequential ramp: a single-hue (rose) monotonic-lightness ramp — the
 * canonical "sequential" scheme (dataviz convention: one hue, ordered
 * lightness/chroma, never a hue rotation) — reserved for future magnitude-only
 * encodings (e.g. a future heat-style view). Not consumed by any PR-1
 * primitive yet.
 */

/** Fixed-order categorical hues. Never cycle past this array — see (d) above. */
export const CATEGORICAL_COLORS: readonly string[] = [
  "var(--color-rose-500)",
  "var(--color-teal)",
  "var(--color-amarillo)",
  "var(--color-rose-300)",
  "var(--color-ink-600)",
];

/** Dedicated neutral for an aggregated "Otros" bucket (top-N + Otros pattern). */
export const CATEGORICAL_OTHER_COLOR = "var(--color-ink-300)";

/**
 * Resolves the fixed-order categorical color for a series index. An
 * aggregated "Otros" bucket (or any index beyond the fixed set) always
 * resolves to the same dedicated neutral — it never cycles back into the
 * hue rotation with a reused, now-ambiguous meaning.
 */
export function getCategoricalColor(
  index: number,
  options?: { isOtros?: boolean },
): string {
  if (options?.isOtros) return CATEGORICAL_OTHER_COLOR;
  return CATEGORICAL_COLORS[index] ?? CATEGORICAL_OTHER_COLOR;
}

/** Single-hue (rose) sequential ramp — monotonic lightness, one hue, never rotated. */
export const SEQUENTIAL_COLORS: readonly string[] = [
  "var(--color-rose-100)",
  "var(--color-rose-300)",
  "var(--color-rose-500)",
  "var(--color-rose-700)",
  "var(--color-rose-900)",
];

/**
 * Status colors — RESERVED for status meaning only (overdue, due-soon,
 * on-track, informational). Never used as a generic categorical hue.
 */
export const STATUS_COLORS = {
  exito: { fg: "var(--color-exito)", bg: "var(--color-exito-bg)" },
  alerta: { fg: "var(--color-alerta)", bg: "var(--color-alerta-bg)" },
  destructivo: {
    fg: "var(--color-destructivo)",
    bg: "var(--color-destructivo-bg)",
  },
  info: { fg: "var(--color-info)", bg: "var(--color-info-bg)" },
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;

/**
 * Surface tokens per mode. `axis`/`grid` mirror the existing `--border`
 * alias exactly (recessive grid/axes per design.md §5) — no new tokens.
 */
export const CHART_SURFACE = {
  light: {
    canvas: "var(--color-canvas)",
    axis: "var(--color-ink-200)",
    grid: "var(--color-ink-200)",
  },
  dark: {
    canvas: "var(--color-ink-950)",
    axis: "var(--color-ink-800)",
    grid: "var(--color-ink-800)",
  },
} as const;

export type ChartSurfaceMode = keyof typeof CHART_SURFACE;
