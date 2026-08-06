export interface UsuarioDirectoryEntry {
  nombre: string;
  email: string;
}

export type UsuarioDirectory = Map<string, UsuarioDirectoryEntry>;

export interface RolOption {
  id: number;
  nombre: string;
  activo: boolean;
}

/**
 * One entry of a responsable `<Select>`'s option list — the flat, ordered
 * counterpart to `UsuarioDirectory`'s id-keyed Map. A picker needs a stable
 * render order, which a Map keyed by uuid cannot give; the Map stays the right
 * shape for resolving a stored id to a label. Lives in this pure file so a
 * `"use client"` form can import the type without dragging the server-only
 * `directory.ts` into the client bundle.
 */
export interface UsuarioOption {
  id: string;
  nombre: string;
}

/**
 * Pure, client-safe usuario-directory helper (split out of `directory.ts`
 * during `documentos-repositorio` PR5a, per the exact bug/fix already
 * documented in `@/lib/crm/catalogo-options`): `directory.ts` also exports
 * `getUsuarioDirectory`, which imports `createClient` from
 * `@/lib/supabase/server` — a server-only module using `next/headers`. A
 * `"use client"` table component (`documentos-table.tsx`) importing
 * `resolveUsuarioLabel`/`UsuarioDirectory` from `directory.ts` would pull
 * that ENTIRE module (including the server-only import) into the client
 * bundle, which Next.js rejects at build/dev time. This file has ZERO
 * server-only imports, so ANY client component may import from it directly.
 * `directory.ts` re-exports these for convenience in Server Components — but
 * a `"use client"` file MUST import from THIS file directly, never through
 * the `directory.ts` barrel, or the same bug recurs.
 */
export function resolveUsuarioLabel(
  directory: UsuarioDirectory,
  id: string | null,
): string {
  if (!id) {
    return "—";
  }
  const entry = directory.get(id);
  return entry ? entry.nombre : "—";
}
