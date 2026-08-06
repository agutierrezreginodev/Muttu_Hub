import { ESTADOS_ACTIVOS } from "../_shared/vencimiento.ts";
import type { DigestRow } from "./aggregate.ts";

/**
 * The slice of a PostgREST client this module uses.
 *
 * Structural rather than the real `SupabaseClient` type so `fetchDueTareas`
 * can be unit-tested with a plain object, and so this file needs no Deno URL
 * import to be readable by vitest.
 */
export interface DigestQuery {
  select(columns: string): DigestQuery;
  eq(column: string, value: unknown): DigestQuery;
  in(column: string, values: readonly unknown[]): DigestQuery;
  not(column: string, operator: string, value: unknown): DigestQuery;
  lte(column: string, value: unknown): DigestQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): Promise<{ data: DigestRow[] | null; error: unknown }>;
}

export interface DigestClient {
  from(table: string): DigestQuery;
}

/**
 * The ONLY module in the digest that talks to Postgres, and the only query
 * shape it is allowed to make (slice 11a, design D6(e)).
 *
 * **Security-critical.** `.eq('responsable_id', usuarioId)` is not optional
 * and not an optimisation. Fetching the whole table once and bucketing by user
 * in application code is FORBIDDEN: the digest runs under the service role,
 * which bypasses RLS, so a table-wide scan would put every user's tareas in
 * one process's memory and make a single bucketing bug an email that tells
 * one person about another's work. Narrowing in the query means the rows for
 * user B are never fetched at all.
 *
 * The estado filter is the shared `ESTADOS_ACTIVOS` constant, never a
 * `vencido=true` filter — matching the bell's query for the same reason
 * (correction C10: `vencido` is true for past-due drafts).
 */
export async function fetchDueTareas(
  client: DigestClient,
  usuarioId: string,
  horizon: Date,
): Promise<DigestRow[]> {
  const { data } = await client
    .from("v_tarea")
    .select("id, titulo, fecha_limite, estado, origen, cliente_id")
    .eq("responsable_id", usuarioId)
    .in("estado", ESTADOS_ACTIVOS)
    .not("fecha_limite", "is", null)
    .lte("fecha_limite", horizon.toISOString())
    .order("fecha_limite", { ascending: true });

  return data ?? [];
}
