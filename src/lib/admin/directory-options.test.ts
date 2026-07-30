import { describe, expect, it } from "vitest";

import {
  resolveUsuarioLabel,
  type UsuarioDirectory,
} from "@/lib/admin/directory-options";

/**
 * PR5a (documentos-repositorio): `resolveUsuarioLabel` split out of
 * `directory.ts` into a client-safe module (mirrors `catalogo-options.ts`'s
 * PR7 split) so `documentos-table.tsx` (a `"use client"` component) can
 * resolve `subidoPor` without pulling `next/headers` into the client bundle.
 */
function makeDirectory(): UsuarioDirectory {
  const directory: UsuarioDirectory = new Map();
  directory.set("user-1", { nombre: "Ana Gómez", email: "ana@example.com" });
  return directory;
}

describe("resolveUsuarioLabel (PR5a directory-options split)", () => {
  it("resolves a known id to its nombre", () => {
    expect(resolveUsuarioLabel(makeDirectory(), "user-1")).toBe("Ana Gómez");
  });

  it("returns the em dash for a null id", () => {
    expect(resolveUsuarioLabel(makeDirectory(), null)).toBe("—");
  });

  it("returns the em dash for an id absent from the directory", () => {
    expect(resolveUsuarioLabel(makeDirectory(), "user-404")).toBe("—");
  });
});
