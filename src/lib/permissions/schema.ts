import { z } from "zod";

/**
 * Fixed 5-module x 5-action permission grid (design "Permission storage":
 * jsonb grid on rol, partial override on usuario). Mirrors the exact key
 * set enforced by the DB CHECK constraint (private.permisos_grid_valid,
 * supabase/migrations/20260728041922_identity.sql).
 */
export const MODULOS = [
  "crm",
  "kanban",
  "documentos",
  "dashboard",
  "admin",
] as const;

export const ACCIONES = [
  "ver",
  "crear",
  "editar",
  "eliminar",
  "exportar",
] as const;

export type Modulo = (typeof MODULOS)[number];
export type Accion = (typeof ACCIONES)[number];

const accionesGridSchema = z.object({
  ver: z.boolean(),
  crear: z.boolean(),
  editar: z.boolean(),
  eliminar: z.boolean(),
  exportar: z.boolean(),
});

/**
 * Full grid: every module present, every module carrying all 5 actions as
 * booleans. Matches rol.permisos' shape exactly (private.permisos_grid_valid).
 */
export const permisosGridSchema = z.object({
  crm: accionesGridSchema,
  kanban: accionesGridSchema,
  documentos: accionesGridSchema,
  dashboard: accionesGridSchema,
  admin: accionesGridSchema,
});

export type PermisosGrid = z.infer<typeof permisosGridSchema>;

const accionesOverrideSchema = accionesGridSchema.partial();

/**
 * Partial override grid: any module may be omitted, and within a present
 * module any action may be omitted. An omitted action means "inherit the
 * role" (spec U4) — it must never be treated as an implicit true/false.
 * NOT shape-checked at the DB (design decision "Permission shape
 * enforcement") — this schema is the actual write-time gate; has_permission()
 * in Postgres is the read-time fail-closed safety net.
 */
export const permisosOverrideSchema = z.object({
  crm: accionesOverrideSchema.optional(),
  kanban: accionesOverrideSchema.optional(),
  documentos: accionesOverrideSchema.optional(),
  dashboard: accionesOverrideSchema.optional(),
  admin: accionesOverrideSchema.optional(),
});

export type PermisosOverride = z.infer<typeof permisosOverrideSchema>;

/** An all-false grid — the safe fail-closed default. */
export function emptyPermisosGrid(): PermisosGrid {
  const denyAll = {
    ver: false,
    crear: false,
    editar: false,
    eliminar: false,
    exportar: false,
  };
  return {
    crm: { ...denyAll },
    kanban: { ...denyAll },
    documentos: { ...denyAll },
    dashboard: { ...denyAll },
    admin: { ...denyAll },
  };
}
