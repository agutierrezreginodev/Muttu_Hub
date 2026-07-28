import { describe, expect, it } from "vitest";

import {
  editUserSchema,
  inviteUserSchema,
  roleSchema,
} from "@/lib/admin/schemas";

const fullGrid = {
  crm: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
  kanban: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: true,
    exportar: true,
  },
  documentos: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: true,
    exportar: true,
  },
  dashboard: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: true,
    exportar: true,
  },
  admin: {
    ver: true,
    crear: true,
    editar: true,
    eliminar: true,
    exportar: true,
  },
};

describe("inviteUserSchema (task 4.4, spec U8)", () => {
  it("accepts a valid invite", () => {
    const result = inviteUserSchema.safeParse({
      nombre: "Ada Lovelace",
      email: "ada@example.com",
      rolId: "3",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      inviteUserSchema.safeParse({
        nombre: "",
        email: "ada@example.com",
        rolId: "3",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteUserSchema.safeParse({
        nombre: "Ada",
        email: "not-an-email",
        rolId: "3",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-numeric rolId", () => {
    expect(
      inviteUserSchema.safeParse({
        nombre: "Ada",
        email: "ada@example.com",
        rolId: "not-a-number",
      }).success,
    ).toBe(false);
  });
});

describe("editUserSchema (task 4.5)", () => {
  it("accepts an empty override (inherit everything)", () => {
    expect(
      editUserSchema.safeParse({
        usuarioId: "11111111-1111-4111-8111-111111111111",
        rolId: 1,
        permisosOverride: {},
      }).success,
    ).toBe(true);
  });

  it("accepts a partial, well-shaped override", () => {
    expect(
      editUserSchema.safeParse({
        usuarioId: "11111111-1111-4111-8111-111111111111",
        rolId: 1,
        permisosOverride: { crm: { eliminar: true } },
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed override (scalar in place of an object) — the write-time gate", () => {
    expect(
      editUserSchema.safeParse({
        usuarioId: "11111111-1111-4111-8111-111111111111",
        rolId: 1,
        permisosOverride: { crm: "pwned" },
      }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid usuarioId", () => {
    expect(
      editUserSchema.safeParse({
        usuarioId: "not-a-uuid",
        rolId: 1,
        permisosOverride: {},
      }).success,
    ).toBe(false);
  });
});

describe("roleSchema (task 4.7, spec U5)", () => {
  it("accepts a valid full grid", () => {
    expect(
      roleSchema.safeParse({
        nombre: "Custom Role",
        descripcion: "A custom role",
        permisos: fullGrid,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      roleSchema.safeParse({
        nombre: "",
        descripcion: "",
        permisos: fullGrid,
      }).success,
    ).toBe(false);
  });

  it("rejects a grid missing a module key", () => {
    const incompleteGrid: Partial<typeof fullGrid> = { ...fullGrid };
    delete incompleteGrid.admin;
    expect(
      roleSchema.safeParse({
        nombre: "Custom Role",
        descripcion: "",
        permisos: incompleteGrid,
      }).success,
    ).toBe(false);
  });

  it("rejects a grid with a non-boolean action value", () => {
    expect(
      roleSchema.safeParse({
        nombre: "Custom Role",
        descripcion: "",
        permisos: {
          ...fullGrid,
          crm: { ...fullGrid.crm, ver: "yes" },
        },
      }).success,
    ).toBe(false);
  });
});
