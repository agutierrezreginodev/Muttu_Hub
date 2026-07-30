import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  updateDocumentoAction,
  deleteDocumentoAction,
} from "@/lib/documentos/actions";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

/**
 * Task 4.6/4.7 (design Decision 6: metadata mutations via Server Actions;
 * mirrors `src/lib/crm/actions.ts`'s `assertCrmPermission` -> zod -> write/
 * RPC -> `revalidatePath` -> `{ error? , success? }` action-state shape).
 * Establishes the actions.test.ts mocking pattern for THIS codebase: no
 * prior actions.ts is unit-tested directly (every existing `*-dialog.test.tsx`
 * mocks the *action function itself*, one layer up) — here we mock
 * `createClient`'s `rpc()` (the permission pre-check call) and `.from()`
 * (the actual write), asserting the permission-gate -> write ->
 * revalidatePath sequence.
 */
function createRpcClient(options: {
  hasPermission: boolean;
  rpcError?: unknown;
  updateError?: unknown;
}) {
  const updateBuilder = {
    eq: vi.fn(() => Promise.resolve({ error: options.updateError ?? null })),
  };
  const rpc = vi.fn().mockResolvedValue({
    data: options.hasPermission,
    error: options.rpcError ?? null,
  });
  const from = vi.fn(() => ({
    update: vi.fn(() => updateBuilder),
  }));
  return { rpc, from, updateBuilder };
}

describe("updateDocumentoAction (task 4.6/4.7, spec: Edit document metadata)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("denies without documentos.editar and never attempts the write", async () => {
    const client = createRpcClient({ hasPermission: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updateDocumentoAction(701, 42, {
      nombre: "Acta actualizada",
      categoria: "contratos",
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("checks has_permission('documentos','editar') as the pre-check", async () => {
    const client = createRpcClient({ hasPermission: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await updateDocumentoAction(701, 42, {
      nombre: "Acta actualizada",
      categoria: "contratos",
    });

    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "documentos",
      accion: "editar",
    });
  });

  it("rejects an empty nombre before ever reaching Supabase", async () => {
    const client = createRpcClient({ hasPermission: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updateDocumentoAction(701, 42, {
      nombre: "",
      categoria: "contratos",
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("updates nombre/categoria/descripcion/tags and revalidates the documentos tab on success", async () => {
    const client = createRpcClient({ hasPermission: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updateDocumentoAction(701, 42, {
      nombre: "Acta actualizada",
      categoria: "legal",
      descripcion: "Nueva descripción",
      tags: ["urgente"],
    });

    expect(client.from).toHaveBeenCalledWith("documento");
    expect(client.updateBuilder.eq).toHaveBeenCalledWith("id", 42);
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/documentos");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the RLS-gated update itself fails (e.g. recategorize into an ungranted category)", async () => {
    const client = createRpcClient({
      hasPermission: true,
      updateError: { message: "permission denied" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updateDocumentoAction(701, 42, {
      nombre: "Acta actualizada",
      categoria: "legal",
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deleteDocumentoAction (task 4.6/4.7, spec: Soft-delete a document)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("denies without documentos.eliminar and never calls the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ rpc } as any);

    const result = await deleteDocumentoAction(701, 42);

    expect(result.error).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "documentos",
      accion: "eliminar",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("calls public.soft_delete_documento and revalidates on success", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null }) // permission pre-check
      .mockResolvedValueOnce({ data: null, error: null }); // soft_delete_documento
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ rpc } as any);

    const result = await deleteDocumentoAction(701, 42);

    expect(rpc).toHaveBeenNthCalledWith(2, "soft_delete_documento", {
      p_id: 42,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/documentos");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the RPC itself fails (e.g. missing eliminar at the DB layer)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "permission denied", code: "42501" },
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ rpc } as any);

    const result = await deleteDocumentoAction(701, 42);

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
