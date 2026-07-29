import { z } from "zod";

import { es } from "@/messages/es";
import { permisosGridSchema, permisosOverrideSchema } from "@/lib/permissions";

/** Task 4.4: invite user (nombre + email + rol). */
export const inviteUserSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  email: z
    .string()
    .trim()
    .min(1, { message: es.auth.emailRequired })
    .email({ message: es.auth.emailInvalid }),
  rolId: z.coerce.number().int().positive(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Task 4.5: edit user — role + permisos_override. */
export const editUserSchema = z.object({
  usuarioId: z.string().uuid(),
  rolId: z.coerce.number().int().positive(),
  permisosOverride: permisosOverrideSchema,
});
export type EditUserInput = z.infer<typeof editUserSchema>;

/** Task 4.7: create/edit role. */
export const roleSchema = z.object({
  nombre: z.string().trim().min(1, { message: es.common.requiredField }),
  descripcion: z.string().trim().optional(),
  permisos: permisosGridSchema,
});
export type RoleInput = z.infer<typeof roleSchema>;

/**
 * Task 5.4 (spec CAT4): create a catalogo row under any tipo, no hardcoded
 * list — the admin screen must work with zero code changes/migrations.
 * `tipo` is constrained to the same snake_case shape as every existing
 * pinned discriminator default (`estado_cliente`, `prioridad`,
 * `nivel_madurez`, ...) so a newly created tipo can be wired to a real
 * consuming column later without a rename.
 */
const catalogoTipoSchema = z
  .string()
  .trim()
  .min(1, { message: es.common.requiredField })
  .regex(/^[a-z][a-z0-9_]*$/, { message: es.admin.catalogos.tipoInvalid });

const catalogoCodigoSchema = z
  .string()
  .trim()
  .min(1, { message: es.common.requiredField });

const catalogoEtiquetaSchema = z
  .string()
  .trim()
  .min(1, { message: es.common.requiredField });

const catalogoOrdenSchema = z.coerce.number().int().min(0).default(0);

export const catalogoCreateSchema = z.object({
  tipo: catalogoTipoSchema,
  codigo: catalogoCodigoSchema,
  etiqueta: catalogoEtiquetaSchema,
  orden: catalogoOrdenSchema,
});
export type CatalogoCreateInput = z.infer<typeof catalogoCreateSchema>;

/**
 * Task 5.4: `tipo`/`codigo` are the natural-key PK (CAT1) and are never
 * editable after creation — matches the grant-restricted `update
 * (etiqueta, orden)` list on `catalogo` (design migration 1, section 2).
 * `activo` is deliberately absent from both schemas: it is excluded from
 * every UPDATE grant and settable only via the `soft_delete_catalogo` RPC
 * (Decision 7).
 */
export const catalogoUpdateSchema = z.object({
  etiqueta: catalogoEtiquetaSchema,
  orden: catalogoOrdenSchema,
});
export type CatalogoUpdateInput = z.infer<typeof catalogoUpdateSchema>;
