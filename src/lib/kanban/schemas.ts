import { z } from "zod";

import { es } from "@/messages/es";

/**
 * Normalizes an optional free-text/catalog-code field: trims, then treats an
 * empty string as absent. Copied from `src/lib/crm/schemas.ts` (same intent,
 * same implementation) — kept local rather than imported so this module has
 * zero cross-module coupling to `crm/schemas.ts` (Kanban and CRM evolve
 * independently even where a helper happens to be identical today).
 */
function optionalTrimmed<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, schema.optional());
}

/**
 * Slice 4a scaffolding (spec KC4/D4): validates a `tarea.etiquetas` write
 * against the currently-**active** `etiqueta_tarea` catalog codes. There is
 * no DB-level FK on array elements (design D4 — a junction table was
 * rejected), so this app-layer check is the ONLY enforcement, not merely the
 * earlier/friendlier gate every other catalog-backed field in this codebase
 * gets. A mix of one active and one inactive/unknown code rejects the WHOLE
 * write — deactivating a tag never silently strips it from an in-flight
 * submission; the caller must explicitly remove it.
 *
 * `activosCodigos` is supplied by the caller (an action, after reading the
 * current `catalogo` rows) rather than baked into a static schema, because
 * "active" is a runtime fact this module cannot know on its own.
 */
export function etiquetasSchema(activosCodigos: readonly string[]) {
  return z
    .array(z.string())
    .default([])
    .refine(
      (values) => values.every((value) => activosCodigos.includes(value)),
      { message: es.kanban.errors.etiquetaInactiva },
    );
}

/**
 * Slice 4a scaffolding (spec KT2): shared field shape for create/edit.
 * `etiquetas` here is only the STRUCTURAL check (an array of strings) — the
 * active-codes check is `etiquetasSchema` above, applied separately by the
 * action layer once the current catalog snapshot is available (slice 5a).
 * Kept structurally identical to `etiquetasSchema`'s output type so the two
 * compose without a mapping step once that wiring lands.
 */
const tareaFields = {
  titulo: z.string().trim().min(1, { message: es.common.requiredField }),
  descripcion: optionalTrimmed(z.string()),
  /**
   * Spec KT1 — the one field CRM's `compromisoSchema` deliberately omits.
   * Kanban never writes `estado='borrador'` (the one CRM state that permits
   * a null responsable via `borrador_sin_responsable`,
   * supabase/migrations/20260728041924_domain.sql), so every Kanban create
   * or edit path REQUIRES a responsable — enforced here, at the earliest
   * possible gate, before the server action or the DB CHECK ever sees it.
   */
  responsableId: z.string().trim().min(1, { message: es.common.requiredField }),
  fechaLimite: optionalTrimmed(z.string().date()),
  prioridad: optionalTrimmed(z.string()),
  etiquetas: z.array(z.string()).default([]),
  clienteId: z.number().int().positive().optional(),
};

/** Task create (spec KT2). */
export const tareaCreateSchema = z.object(tareaFields);
export type TareaCreateInput = z.infer<typeof tareaCreateSchema>;

/** Task edit (spec KT1/KT2) — same shape; responsable stays required on edit too. */
export const tareaUpdateSchema = z.object(tareaFields);
export type TareaUpdateInput = z.infer<typeof tareaUpdateSchema>;

/**
 * Comment form (spec KM1's non-blank CHECK). Deliberately has ONLY `texto`
 * — mirrors `src/lib/crm/schemas.ts`'s `bitacoraSchema` exactly: `autor_id`
 * is never client-supplied (forced server-side from the session, matching
 * `tarea_comentario_insert`'s `autor_id = (select auth.uid())` WITH CHECK,
 * supabase/migrations/20260730192212_kanban_comentario.sql).
 */
export const comentarioSchema = z.object({
  texto: z.string().trim().min(1, { message: es.common.requiredField }),
});
export type ComentarioInput = z.infer<typeof comentarioSchema>;
