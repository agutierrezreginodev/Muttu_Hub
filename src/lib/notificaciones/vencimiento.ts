/**
 * Next-side entry point for the canonical due-date model (slice 10).
 *
 * A barrel, deliberately containing no logic of its own. The real definition
 * lives at `supabase/functions/_shared/vencimiento.ts` because the daily
 * digest Edge Function (slice 11) runs under Deno and cannot import from
 * `src/`. Re-exporting it here means the app never reaches across that
 * boundary by hand, and the board badge, the bell and the digest provably
 * share one implementation rather than three that agree today.
 *
 * The imported file joins the TypeScript program through this import even
 * though `supabase/functions` is excluded from `tsconfig.json` — an imported
 * file is always part of the program regardless of `exclude`.
 */
export * from "../../../supabase/functions/_shared/vencimiento";
