import { z } from "zod";

import { es } from "@/messages/es";

/**
 * Normalizes an optional free-text/catalog-code field: trims, then treats an
 * empty string as absent (never as an explicit "" write) — the same
 * intent as `roleSchema.descripcion`'s `.trim().optional()`, generalized so
 * a controlled-input General tab form (which always sends a string, never
 * `undefined`) round-trips cleanly instead of writing empty strings to
 * nullable `cliente` columns.
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
 * Task 6.7: create a cliente from the list screen. `tipoCliente`/`estado`
 * are optional catalog codes (both are FK-enforced in Postgres — this is
 * the earlier, friendlier gate, same posture as every other schema in this
 * codebase); `estado` falls back to the DB's own `default 'activo'` when
 * omitted.
 */
export const clienteCreateSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  tipoCliente: optionalTrimmed(z.string()),
  estado: optionalTrimmed(z.string()),
});
export type ClienteCreateInput = z.infer<typeof clienteCreateSchema>;

/**
 * Task 6.4 (spec FC1): the ficha's General tab — all 9 columns PR2 added to
 * `cliente`. Descriptive/classification fields (`tamanoOrganizacion`,
 * `canalContactoInicial`, `prioridad`, `nivelMadurez`) are catalog codes,
 * validated as non-empty-when-present strings here (the DB FK is the real
 * enforcement); the other 5 are free-text/date columns with no catalog. All
 * 9 are optional — the tab starts blank and is filled in over time.
 */
export const clienteGeneralSchema = z.object({
  empresa: optionalTrimmed(z.string()),
  tamanoOrganizacion: optionalTrimmed(z.string()),
  ubicacion: optionalTrimmed(z.string()),
  canalContactoInicial: optionalTrimmed(z.string()),
  fechaPrimerContacto: optionalTrimmed(z.string().date()),
  prioridad: optionalTrimmed(z.string()),
  nivelMadurez: optionalTrimmed(z.string()),
  prioridadesIdentificadas: optionalTrimmed(z.string()),
  riesgosBarreras: optionalTrimmed(z.string()),
});
export type ClienteGeneralInput = z.infer<typeof clienteGeneralSchema>;
