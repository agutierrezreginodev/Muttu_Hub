import { describe, expect, it } from "vitest";

import { hasPermission, mergePermissions } from "@/lib/permissions";

const coordinadorGrid = {
  crm: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: false,
    exportar: false,
  },
  kanban: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: false,
    exportar: false,
  },
  documentos: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: false,
    exportar: false,
  },
  dashboard: {
    ver: true,
    crear: false,
    editar: false,
    eliminar: false,
    exportar: false,
  },
  admin: {
    ver: false,
    crear: false,
    editar: false,
    eliminar: false,
    exportar: false,
  },
};

describe("mergePermissions (spec U4: override beats role)", () => {
  it("resolves to the role grid when there is no override", () => {
    const merged = mergePermissions(coordinadorGrid, null);
    expect(hasPermission(merged, "crm", "editar")).toBe(true);
    expect(hasPermission(merged, "crm", "eliminar")).toBe(false);
    expect(hasPermission(merged, "admin", "ver")).toBe(false);
  });

  it("lets a present override key grant an action the role denies", () => {
    const merged = mergePermissions(coordinadorGrid, {
      crm: { eliminar: true },
    });
    expect(hasPermission(merged, "crm", "eliminar")).toBe(true);
    // Sibling actions in the same module are untouched.
    expect(hasPermission(merged, "crm", "editar")).toBe(true);
  });

  it("lets a present override key deny an action the role grants", () => {
    const merged = mergePermissions(coordinadorGrid, {
      crm: { editar: false },
    });
    expect(hasPermission(merged, "crm", "editar")).toBe(false);
  });

  it("inherits the role entirely for a module absent from the override", () => {
    const merged = mergePermissions(coordinadorGrid, {
      crm: { eliminar: true },
    });
    expect(hasPermission(merged, "kanban", "editar")).toBe(true);
    expect(hasPermission(merged, "kanban", "eliminar")).toBe(false);
  });

  it("fails closed on a malformed override (scalar in place of an object)", () => {
    const merged = mergePermissions(coordinadorGrid, { crm: "pwned" });
    // The whole override is discarded; role values still apply elsewhere...
    expect(hasPermission(merged, "kanban", "editar")).toBe(true);
    // ...and the malformed module never grants anything extra.
    expect(hasPermission(merged, "crm", "eliminar")).toBe(false);
  });

  it("fails closed on a malformed override (non-boolean leaf value)", () => {
    const merged = mergePermissions(coordinadorGrid, {
      crm: { ver: "banana" },
    });
    expect(hasPermission(merged, "crm", "ver")).toBe(true); // falls back to role
    expect(hasPermission(merged, "admin", "ver")).toBe(false);
  });

  it("denies every action when the role grid itself is malformed", () => {
    const merged = mergePermissions({ crm: "not-a-grid" }, null);
    expect(hasPermission(merged, "crm", "ver")).toBe(false);
    expect(hasPermission(merged, "admin", "eliminar")).toBe(false);
  });

  it("denies every action when the role grid is missing entirely", () => {
    const merged = mergePermissions(null, null);
    expect(hasPermission(merged, "crm", "ver")).toBe(false);
  });
});
