export interface CatalogoOption {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export type CatalogoOptionsMap = Map<string, CatalogoOption[]>;

/**
 * Pure, client-safe catalog-option helpers (split out of `catalogos.ts`
 * during PR7 apply after a real bug: `catalogos.ts` also exports
 * `getCatalogoOptions`, which imports `createClient` from
 * `@/lib/supabase/server` — a server-only module using `next/headers`. A
 * `"use client"` table component (`contactos-table.tsx`,
 * `oportunidades-table.tsx`) importing `resolveCatalogoLabel`/
 * `activeCatalogoOptions` from `catalogos.ts` pulled that ENTIRE module
 * (including the server-only import) into the client bundle, which Next.js
 * rejects at build/dev time ("You're importing a component that needs
 * next/headers..."). This file has ZERO server-only imports, so ANY client
 * component may import from it directly. `catalogos.ts` re-exports these
 * for convenience in Server Components — but a `"use client"` file MUST
 * import from THIS file directly, never through the `catalogos.ts` barrel,
 * or the same bug recurs.
 */

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
