import { z } from "zod";

import { es } from "@/messages/es";

/**
 * Mirrors `src/lib/crm/schemas.ts`'s `optionalTrimmed`: trims, then treats
 * an empty string as absent (never as an explicit "" write) — a controlled
 * text input always sends a string, never `undefined`.
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
 * Task 4.1/4.2 (spec document-library "Document metadata model"): `nombre`
 * and `categoria` are required — `categoria` is the gating axis for
 * document-permissions, so a document without one could not be
 * authorization-checked (the DB enforces this with NOT NULL + a composite
 * FK to `catalogo`; this is the earlier, friendlier gate). `tags` mirrors
 * `oportunidadSchema.serviciosInteres`'s set-replace posture: every save
 * sends the FULL current array, defaulting to an empty array when none are
 * selected.
 */
export const documentoMetadataSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  categoria: z.string().trim().min(1, { message: es.common.requiredField }),
  descripcion: optionalTrimmed(z.string()),
  tags: z.array(z.string().trim().min(1)).default([]),
});
export type DocumentoMetadataInput = z.infer<typeof documentoMetadataSchema>;

/**
 * Task 4.1/4.2 (spec document-versioning "Parent + version-row model"):
 * validates the SHAPE of a version's physical attributes before they reach
 * `add_documento_version` (PR6's upload Route Handler). Deliberately does
 * NOT enforce a size cap or a mime allow-list — open question 6 (per-bucket
 * mime/size restriction in `config.toml`) is still unresolved by the owner
 * (PR3 task 3.3 was explicitly skipped for the same reason). `sizeBytes`
 * non-negative integer mirrors the DB's own
 * `size_bytes bigint not null check (size_bytes >= 0)`.
 */
export const documentoUploadMetadataSchema = z.object({
  originalFilename: z
    .string()
    .trim()
    .min(1, { message: es.common.requiredField }),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1, { message: es.common.requiredField }),
});
export type DocumentoUploadMetadataInput = z.infer<
  typeof documentoUploadMetadataSchema
>;
