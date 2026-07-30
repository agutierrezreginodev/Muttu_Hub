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

/**
 * Task 7.3 (spec CO1-CO3): the ficha's Contactos tab. `correo` is validated
 * as a real email shape when present (a friendlier gate than the DB, which
 * stores it as plain `text`); `perfilDecision` is a catalog code, validated
 * only as a non-empty string here — the FK is the real enforcement, same
 * posture as every other catalog-backed field in `clienteGeneralSchema`.
 */
export const contactoSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  cargo: optionalTrimmed(z.string()),
  correo: optionalTrimmed(
    z.string().email({ message: es.crm.contactos.correoInvalid }),
  ),
  telefono: optionalTrimmed(z.string()),
  perfilDecision: optionalTrimmed(z.string()),
  notas: optionalTrimmed(z.string()),
});
export type ContactoInput = z.infer<typeof contactoSchema>;

/**
 * Normalizes an optional numeric field submitted as a string (HTML number
 * inputs always send a string, never `undefined`): trims, empty -> absent,
 * otherwise coerces to a number. Mirrors `optionalTrimmed`'s intent for the
 * one numeric field this tab has (`valorEstimadoCop`).
 */
function optionalNonNegativeNumber() {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === "" ? undefined : Number(trimmed);
  }, z.number().nonnegative().optional());
}

/**
 * Task 7.3 (spec OP1-OP4): the ficha's Oportunidades tab. `estado` is a
 * catalog code (FK-enforced in Postgres, `not null default 'abierta'` per
 * design's DDL — this schema still treats it as optional so the DB default
 * applies when omitted, same posture as `clienteCreateSchema.estado`).
 * `serviciosInteres` is the FULL set of catalog codes the multi-select
 * currently holds — every save sends this complete array to
 * `set_oportunidad_servicios` (set-replace semantics), never an incremental
 * add/remove diff (design Decision 6, spec-required behavior).
 */
export const oportunidadSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  problemaDetectado: optionalTrimmed(z.string()),
  solucionPropuesta: optionalTrimmed(z.string()),
  proyectosAnteriores: optionalTrimmed(z.string()),
  valorEstimadoCop: optionalNonNegativeNumber(),
  estado: optionalTrimmed(z.string()),
  fechaUltimaGestion: optionalTrimmed(z.string().date()),
  serviciosInteres: z.array(z.string().trim().min(1)).default([]),
});
export type OportunidadInput = z.infer<typeof oportunidadSchema>;

/**
 * Task 8.3 (spec BIT1/BIT4): the ficha's Bitácora append-only entry form.
 * Deliberately has ONLY `texto` — no `autorId` field exists on this schema
 * at all, because `autor_id` is never client-supplied (forced server-side
 * from the session in `addBitacoraEntryAction`, matching the INSERT
 * policy's `autor_id = (select auth.uid())` WITH CHECK,
 * supabase/migrations/20260728200200_crm_bitacora.sql). `.trim().min(1)`
 * mirrors the DB's own `check (length(btrim(texto)) > 0)`.
 */
export const bitacoraSchema = z.object({
  texto: z.string().trim().min(1, { message: es.common.requiredField }),
});
export type BitacoraInput = z.infer<typeof bitacoraSchema>;

/**
 * Task 8.3 (spec FC9, design Decision 9): creating a compromiso is a plain
 * `tarea` insert with `origen = 'CRM'` — no new table. `fechaLimite` and
 * `prioridad` are optional, same posture as every other optional field in
 * this file; `prioridad` is a catalog code (FK-enforced in Postgres, the
 * real gate here is only a non-empty-when-present string, same as
 * `clienteGeneralSchema.prioridad`).
 */
export const compromisoSchema = z.object({
  titulo: z.string().trim().min(1, { message: es.common.requiredField }),
  fechaLimite: optionalTrimmed(z.string().date()),
  prioridad: optionalTrimmed(z.string()),
});
export type CompromisoInput = z.infer<typeof compromisoSchema>;
