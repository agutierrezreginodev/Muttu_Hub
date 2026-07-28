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
