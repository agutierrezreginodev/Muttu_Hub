import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface CatalogoOption {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export type CatalogoOptionsMap = Map<string, CatalogoOption[]>;

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

/** Active-only options for a given `tipo` — what a create/edit picker must offer (deactivated codes never appear as a NEW choice). */
export function activeCatalogoOptions(
  map: CatalogoOptionsMap,
  tipo: string,
): CatalogoOption[] {
  return (map.get(tipo) ?? []).filter((option) => option.activo);
}

/**
 * Resolves a stored `codigo` to its display `etiqueta`, INCLUDING
 * deactivated codes (mirrors `resolveUsuarioLabel`'s null-safe fallback).
 * Falls back to the raw `codigo` — never "—" — when the pair is unknown to
 * the map (e.g. a race with a very recent write); "—" is reserved for the
 * genuinely-empty case (`codigo` is null).
 */
export function resolveCatalogoLabel(
  map: CatalogoOptionsMap,
  tipo: string,
  codigo: string | null,
): string {
  if (!codigo) {
    return "—";
  }
  const option = (map.get(tipo) ?? []).find((entry) => entry.codigo === codigo);
  return option ? option.etiqueta : codigo;
}
