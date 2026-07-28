import {
  ACCIONES,
  MODULOS,
  emptyPermisosGrid,
  permisosGridSchema,
  permisosOverrideSchema,
  type Accion,
  type Modulo,
  type PermisosGrid,
  type PermisosOverride,
} from "@/lib/permissions/schema";

export {
  ACCIONES,
  MODULOS,
  emptyPermisosGrid,
  permisosGridSchema,
  permisosOverrideSchema,
};
export type {
  Accion,
  Modulo,
  PermisosGrid,
  PermisosOverride,
} from "@/lib/permissions/schema";

/**
 * Merges a role's full permission grid with a user's partial override
 * (spec U4: a present override key always beats the role). This is a
 * UI-side READ helper only (task 4.1) — it decides what to render (nav
 * links, buttons, form fields). It is never the security boundary: every
 * server mutation and every route gate must still go through Postgres RLS
 * or an explicit has_permission() RPC call (design decision "Security
 * boundary"), never trust this merge for an actual authorization decision.
 *
 * Fail-closed (design decision "Permission shape enforcement" + spec D7):
 * - If `rolePermisos` does not parse as a valid full grid, every action
 *   resolves to false rather than throwing.
 * - If `override` is present but does not parse as a valid partial grid
 *   (e.g. a scalar in place of an object), it is treated as absent — the
 *   result falls back to the role, exactly like the DB's own malformed-
 *   override handling for the shapes it can COALESCE through.
 */
export function mergePermissions(
  rolePermisos: unknown,
  override: unknown,
): PermisosGrid {
  const roleResult = permisosGridSchema.safeParse(rolePermisos);
  const overrideResult = permisosOverrideSchema.safeParse(override ?? {});

  if (!roleResult.success) {
    return emptyPermisosGrid();
  }

  const role = roleResult.data;
  const parsedOverride = overrideResult.success ? overrideResult.data : {};

  const grid = emptyPermisosGrid();

  for (const modulo of MODULOS) {
    const moduleOverride = parsedOverride[modulo];
    const moduleRole = role[modulo];

    for (const accion of ACCIONES) {
      const overrideValue = moduleOverride?.[accion];
      grid[modulo][accion] =
        overrideValue !== undefined ? overrideValue : moduleRole[accion];
    }
  }

  return grid;
}

/** Reads a single cell from an already-merged grid. Defaults to false. */
export function hasPermission(
  grid: PermisosGrid,
  modulo: Modulo,
  accion: Accion,
): boolean {
  return grid[modulo]?.[accion] ?? false;
}

/** Dense (all 5 module keys always present, possibly empty) shape used by the editor's working state — a partial override may omit modules entirely. */
export type DenseOverride = Record<Modulo, Partial<Record<Accion, boolean>>>;

/**
 * Fills in every module key (possibly with an empty object) so a partial
 * override is safe to edit as controlled component state. The reverse
 * direction (dense state -> PermisosOverride) needs no conversion: a
 * required-key record is structurally assignable wherever the optional-key
 * PermisosOverride type is expected.
 */
export function denseOverride(
  override: PermisosOverride | null,
): DenseOverride {
  const dense = {} as DenseOverride;
  for (const modulo of MODULOS) {
    dense[modulo] = { ...(override?.[modulo] ?? {}) };
  }
  return dense;
}
