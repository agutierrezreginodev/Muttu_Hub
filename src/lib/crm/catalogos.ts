import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import {
  activeCatalogoOptions,
  resolveCatalogoLabel,
  type CatalogoOption,
  type CatalogoOptionsMap,
} from "@/lib/crm/catalogo-options";

export type {
  CatalogoOption,
  CatalogoOptionsMap,
} from "@/lib/crm/catalogo-options";
export { activeCatalogoOptions, resolveCatalogoLabel };

/**
 * All `catalogo` rows (active AND inactive), grouped by `tipo` (task 6.2).
 * `React.cache()`'d so every Server Component in the same request shares one
 * Supabase round trip, mirroring `getUsuarioDirectory`
 * (src/lib/admin/directory.ts). Reads the BASE `catalogo` table rather than
 * `v_catalogo` (which is active-only, the picklist surface) — display code
 * must still resolve a DEACTIVATED code a historic cliente/tarea/contacto/
 * oportunidad row stores, so history stays readable (design: "Forms offer
 * active codes only; display resolves stored codes (including deactivated
 * ones)"). Use `activeCatalogoOptions()` to build a picker's option list.
 *
 * SERVER-ONLY (imports `createClient`, which uses `next/headers`). The pure
 * `activeCatalogoOptions`/`resolveCatalogoLabel` helpers and their types are
 * re-exported above for convenience in Server Components, but a `"use
 * client"` file MUST import them from `@/lib/crm/catalogo-options` directly
 * instead of from this file — see that file's doc comment for the exact bug
 * this split fixes (PR7 apply).
 */
export const getCatalogoOptions = cache(
  async (): Promise<CatalogoOptionsMap> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("catalogo")
      .select("tipo, codigo, etiqueta, orden, activo")
      .order("tipo")
      .order("orden")
      .order("etiqueta");

    const map: CatalogoOptionsMap = new Map();
    for (const row of data ?? []) {
      const option: CatalogoOption = {
        codigo: row.codigo,
        etiqueta: row.etiqueta,
        orden: row.orden,
        activo: row.activo,
      };
      const existing = map.get(row.tipo);
      if (existing) {
        existing.push(option);
      } else {
        map.set(row.tipo, [option]);
      }
    }
    return map;
  },
);
