import { createClient } from "@/lib/supabase/server";

/**
 * ABSENCE of a `notificacion_preferencia` row means the user is opted IN
 * (spec DG3). The migration ships no backfill precisely so that the common
 * case costs no row, which makes this default the actual behaviour for most
 * of the userbase — not an edge case. Reading a missing row as `false` would
 * silently opt everyone out of a digest they never disabled.
 */
export const RESUMEN_DIARIO_POR_DEFECTO = true;

/**
 * The caller's own digest preference (slice 13).
 *
 * Reads `v_notificacion_preferencia`, the `security_invoker` surface, keeping
 * every `src/lib/**` read on a `v_*` view as the rest of the codebase does.
 * RLS already scopes the view to `auth.uid()`; the explicit `.eq()` states the
 * same intent at the call site rather than relying on the policy alone.
 *
 * Degrades to the default rather than throwing, matching the "empty, never an
 * error" convention every read helper here follows.
 */
export async function getResumenDiarioPreferencia(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return RESUMEN_DIARIO_POR_DEFECTO;
  }

  const { data } = await supabase
    .from("v_notificacion_preferencia")
    .select("resumen_diario_email")
    .eq("usuario_id", user.id)
    .maybeSingle();

  return data?.resumen_diario_email ?? RESUMEN_DIARIO_POR_DEFECTO;
}
