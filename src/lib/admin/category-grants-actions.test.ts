import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  grantCategoryAction,
  revokeCategoryAction,
} from "@/lib/admin/category-grants-actions";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const mockedCreateClient = vi.mocked(createClient);

function stubSupabase({
  allowed = true,
  writeError = null as unknown,
}: { allowed?: boolean; writeError?: unknown } = {}) {
  const insert = vi.fn(async () => ({ error: writeError }));

  const deleteBuilder = {
    eq: vi.fn(() => deleteBuilder),
    then: (resolve: (value: { error: unknown }) => void) =>
      resolve({ error: writeError }),
  };
  const del = vi.fn(() => deleteBuilder);

  const rpc = vi.fn(async () => ({ data: allowed, error: null }));
  const from = vi.fn(() => ({ insert, delete: del }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateClient.mockResolvedValue({ rpc, from } as any);

  return { rpc, from, insert, del, deleteBuilder };
}

describe("grantCategoryAction (task 7.1/7.2, spec document-permissions 'Category grants are admin-managed')", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("inserts the grant and revalidates the admin screen", async () => {
    const { insert } = stubSupabase();

    const result = await grantCategoryAction(1, "contratos");

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({ rol_id: 1, categoria: "contratos" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/documentos");
  });

  it("pre-checks admin.editar — the same verb the table's own policy requires", async () => {
    const { rpc } = stubSupabase();

    await grantCategoryAction(1, "contratos");

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
  });

  it("writes nothing when the caller is not an admin", async () => {
    const { insert } = stubSupabase({ allowed: false });

    const result = await grantCategoryAction(1, "contratos");

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
    expect(insert).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a database failure instead of claiming success", async () => {
    stubSupabase({ writeError: { message: "23503" } });

    const result = await grantCategoryAction(1, "inventada");

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive rol id without touching the database", async () => {
    const { insert } = stubSupabase();

    const result = await grantCategoryAction(0, "contratos");

    expect(result.error).toBeDefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an empty categoria", async () => {
    const { insert } = stubSupabase();

    const result = await grantCategoryAction(1, "");

    expect(result.error).toBeDefined();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("revokeCategoryAction (task 7.1/7.2)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("deletes exactly the one (rol, categoria) pair, never a whole role's grants", async () => {
    const { del, deleteBuilder } = stubSupabase();

    const result = await revokeCategoryAction(1, "contratos");

    expect(result.success).toBe(true);
    expect(del).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("rol_id", 1);
    expect(deleteBuilder.eq).toHaveBeenCalledWith("categoria", "contratos");
    expect(deleteBuilder.eq).toHaveBeenCalledTimes(2);
  });

  it("pre-checks admin.editar", async () => {
    const { rpc } = stubSupabase();

    await revokeCategoryAction(1, "contratos");

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
  });

  it("deletes nothing when the caller is not an admin", async () => {
    const { del } = stubSupabase({ allowed: false });

    const result = await revokeCategoryAction(1, "contratos");

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
    expect(del).not.toHaveBeenCalled();
  });

  it("reports a database failure instead of claiming success", async () => {
    stubSupabase({ writeError: { message: "42501" } });

    const result = await revokeCategoryAction(1, "contratos");

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
