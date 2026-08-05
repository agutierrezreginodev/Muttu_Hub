"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import { getCatalogoOptions, activeCatalogoOptions } from "@/lib/crm/catalogos";
import type { Accion, Modulo } from "@/lib/permissions";
import {
  etiquetasSchema,
  tareaCreateSchema,
  type TareaCreateInput,
} from "@/lib/kanban/schemas";

export interface KanbanActionState {
  error?: string;
  success?: boolean;
}

/**
 * Mirrors `assertCrmPermission` (src/lib/crm/actions.ts) exactly, scoped to the
 * `kanban` module. The module matters and is asserted in the test suite: RLS on
 * `tarea` is origen-aware (`tarea_insert`/`tarea_update`,
 * supabase/migrations/20260728041925_audit.sql:197-217), so an
 * `origen='Kanban'` write is gated on `has_permission('kanban', …)` and a
 * pre-check against `crm` would diverge from the real boundary.
 *
 * This is the earlier, friendlier gate — Postgres RLS is the actual one.
 * RLS-gated client ONLY, never the service role: there is no auth-admin work
 * anywhere in Kanban.
 */
async function assertKanbanPermission(accion: Accion): Promise<string | null> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    modulo: "kanban" satisfies Modulo,
    accion,
  });

  if (error || !allowed) {
    return es.common.genericError;
  }

  return null;
}

/**
 * Validates `etiquetas` against the currently-ACTIVE `etiqueta_tarea` codes.
 *
 * `tareaCreateSchema` only checks the STRUCTURE of the array (design D4 / spec
 * KC4) — the active-codes check needs a runtime catalog snapshot a static schema
 * cannot hold, which is why `schemas.ts` deliberately left it to this layer.
 * There is no DB-level FK on array elements, so this is the ONLY enforcement
 * that exists, not merely a nicer early error.
 */
async function assertEtiquetasActivas(
  etiquetas: string[],
): Promise<string | null> {
  const catalogo = await getCatalogoOptions();
  const activos = activeCatalogoOptions(catalogo, "etiqueta_tarea").map(
    (option) => option.codigo,
  );

  const parsed = etiquetasSchema(activos).safeParse(etiquetas);
  return parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? es.common.genericError);
}

/**
 * Create a Kanban tarea (spec KT2, PRD §5.2). `titulo` is the only field a user
 * must supply — every other field is optional and completed later, per PRD
 * §5.2's "único campo obligatorio al crear". `responsableId` is required too,
 * but by the SYSTEM rather than by the user's judgment: PRD §5.3 forbids an
 * ownerless tarea on the active board, and since Kanban never writes
 * `estado='borrador'` (the one state `borrador_sin_responsable` exempts,
 * domain.sql:37) there is no legitimate null-responsable Kanban row. The form
 * layer defaults it to the current user rather than asking.
 *
 * Writes `origen='Kanban'`, which is what makes the origen-aware `tarea_insert`
 * policy match — and what keeps the row out of CRM-scoped queries filtering on
 * origen.
 *
 * `columna` is deliberately NOT written here. A new card lands with a null
 * `columna` and `groupTareasByColumna` (slice 4a) already folds null-column
 * rows into the first column, so the board shows it immediately without this
 * action having to know which column is "first" — that ordering belongs to the
 * catalog, not to a write path.
 */
export async function createTareaAction(
  input: TareaCreateInput,
): Promise<KanbanActionState> {
  const permissionError = await assertKanbanPermission("crear");
  if (permissionError) {
    return { error: permissionError };
  }

  const parsed = tareaCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? es.common.genericError };
  }

  const etiquetasError = await assertEtiquetasActivas(parsed.data.etiquetas);
  if (etiquetasError) {
    return { error: etiquetasError };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tarea").insert({
    titulo: parsed.data.titulo,
    responsable_id: parsed.data.responsableId,
    descripcion: parsed.data.descripcion ?? null,
    cliente_id: parsed.data.clienteId ?? null,
    fecha_limite: parsed.data.fechaLimite ?? null,
    etiquetas: parsed.data.etiquetas,
    origen: "Kanban",
    ...(parsed.data.prioridad ? { prioridad: parsed.data.prioridad } : {}),
  });

  if (error) {
    return { error: es.common.genericError };
  }

  revalidatePath("/kanban");
  return { success: true };
}
