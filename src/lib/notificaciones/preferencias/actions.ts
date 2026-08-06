"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";

export interface PreferenciasActionState {
  error?: string;
  success?: boolean;
}

export interface SetResumenDiarioInput {
  resumenDiarioEmail: boolean;
}

const PREFERENCIAS_PATH = "/preferencias";
const TABLA = "notificacion_preferencia";

/** Postgres `unique_violation` — the insert lost the race, the row now exists. */
const UNIQUE_VIOLATION = "23505";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Updates the caller's own row and reports whether one actually matched.
 *
 * `.select()` is what makes the answer knowable: PostgREST returns the
 * affected rows, so an empty array means "no row yet" — the signal the
 * insert fallback needs. Only `resumen_diario_email` is ever assigned;
 * `usuario_id` and `updated_at` are deliberately outside the UPDATE grant
 * (`20260730193725_notificacion_preferencia_digest.sql`), and `updated_at`
 * belongs to the `touch_updated_at` trigger.
 */
async function updateOwnRow(
  supabase: Supabase,
  usuarioId: string,
  resumenDiarioEmail: boolean,
): Promise<{ matched: boolean; failed: boolean }> {
  const { data, error } = await supabase
    .from(TABLA)
    .update({ resumen_diario_email: resumenDiarioEmail })
    .eq("usuario_id", usuarioId)
    .select("usuario_id");

  if (error) {
    return { matched: false, failed: true };
  }

  return { matched: (data ?? []).length > 0, failed: false };
}

/**
 * Sets the caller's daily-digest preference (slice 13).
 *
 * **This is deliberately not an upsert.** `notificacion_preferencia` grants
 * `authenticated` a COLUMN-level `update (resumen_diario_email)` and no
 * table-level UPDATE, and PostgREST's upsert emits `INSERT ... ON CONFLICT
 * DO UPDATE`, whose privileges Postgres checks when it PLANS the statement
 * rather than when it picks a branch. So `.upsert()` on this table returns
 * 403 / SQLSTATE 42501 unconditionally — including the first call, where no
 * row exists and the INSERT branch is the one that would run. That was
 * verified against the running REST API, not read off the grant.
 *
 * Hence update-first, insert-fallback. Both statements stay inside the
 * RLS-gated client: no definer RPC, no service role, no elevated privilege
 * anywhere in this path. RLS scopes both to `auth.uid()`, so the worst a
 * forged `usuario_id` could achieve is writing the row it already owns.
 */
export async function setResumenDiarioAction({
  resumenDiarioEmail,
}: SetResumenDiarioInput): Promise<PreferenciasActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: es.common.genericError };
  }

  const updated = await updateOwnRow(supabase, user.id, resumenDiarioEmail);

  if (updated.failed) {
    return { error: es.common.genericError };
  }

  if (!updated.matched) {
    const { error } = await supabase
      .from(TABLA)
      .insert({ usuario_id: user.id, resumen_diario_email: resumenDiarioEmail });

    if (error) {
      // Anything but a lost race is a real failure.
      if (error.code !== UNIQUE_VIOLATION) {
        return { error: es.common.genericError };
      }

      // The row appeared between the update and the insert — a concurrent
      // save from another tab. Retry the update, which now has a target.
      const retried = await updateOwnRow(
        supabase,
        user.id,
        resumenDiarioEmail,
      );

      if (retried.failed || !retried.matched) {
        return { error: es.common.genericError };
      }
    }
  }

  revalidatePath(PREFERENCIAS_PATH);
  return { success: true };
}
