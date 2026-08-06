/**
 * Next-side entry point for the deep-link rule (slice 10, moved to the shared
 * module in slice 11a).
 *
 * The implementation lives in `supabase/functions/_shared/vencimiento.ts`
 * alongside `classify`, because the digest email builds the same links and
 * the Edge Function cannot import from `src/`. This barrel keeps the app's
 * import path unchanged and adds no logic of its own.
 */
export { hrefFor } from "@/lib/notificaciones/vencimiento";
