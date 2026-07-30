// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { POST } from "./route";

const mockedCreateClient = vi.mocked(createClient);

interface SupabaseStubOptions {
  /** `has_permission` result for the pre-check. */
  allowed?: boolean;
  /** Highest existing version for the add-a-version branch. */
  currentVersion?: number | null;
  insertedDocumentoId?: number;
  insertError?: unknown;
  uploadError?: unknown;
  addVersionError?: unknown;
}

/**
 * Route-handler stub for the RLS-gated client. This is the first Route Handler
 * in this codebase, so it also establishes how they get tested: the real
 * `POST` is invoked with a real `Request` carrying real `FormData`, and only
 * Supabase and `next/cache` are mocked. Nothing here simulates RLS — RLS is
 * exercised by the pgTAP suite; these tests pin the handler's own sequencing
 * (pre-check → parse → write → revalidate) and its failure behaviour.
 */
function stubSupabase(options: SupabaseStubOptions = {}) {
  const {
    allowed = true,
    currentVersion = null,
    insertedDocumentoId = 42,
    insertError = null,
    uploadError = null,
    addVersionError = null,
  } = options;

  const upload = vi.fn(async () => ({ data: { path: "x" }, error: uploadError }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "has_permission") {
      return { data: allowed, error: null };
    }
    return { data: null, error: addVersionError };
  });

  const insertSingle = vi.fn(async () => ({
    data: insertError ? null : { id: insertedDocumentoId },
    error: insertError,
  }));
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: insertSingle })),
  }));

  const versionBuilder = {
    select: vi.fn(() => versionBuilder),
    eq: vi.fn(() => versionBuilder),
    order: vi.fn(() => versionBuilder),
    limit: vi.fn(async () => ({
      data: currentVersion == null ? [] : [{ version: currentVersion }],
      error: null,
    })),
  };

  const from = vi.fn((table: string) => {
    if (table === "documento") {
      return { insert } as never;
    }
    return versionBuilder as never;
  });

  const client = {
    rpc,
    from,
    storage: { from: vi.fn(() => ({ upload })) },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateClient.mockResolvedValue(client as any);

  return { rpc, from, insert, upload, versionBuilder };
}

function makeRequest(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return new Request("http://localhost/crm/10/documentos/upload", {
    method: "POST",
    body,
  });
}

function makeFile(name = "acta.pdf") {
  return new File(["some bytes"], name, { type: "application/pdf" });
}

const params = Promise.resolve({ id: "10" });

describe("POST /crm/[id]/documentos/upload (task 6.1/6.2, design Decision 6)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects a request with no file before touching Supabase", async () => {
    const { upload, rpc } = stubSupabase();

    const response = await POST(
      makeRequest({ nombre: "Acta", categoria: "contratos" }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(
      "add_documento_version",
      expect.anything(),
    );
  });

  it("denies without documentos.crear and uploads no bytes", async () => {
    const { upload, insert } = stubSupabase({ allowed: false });

    const response = await POST(
      makeRequest({
        file: makeFile(),
        nombre: "Acta",
        categoria: "contratos",
        tags: "[]",
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("gates on `crear` — the same verb add_documento_version itself enforces", async () => {
    const { rpc } = stubSupabase();

    await POST(
      makeRequest({
        file: makeFile(),
        nombre: "Acta",
        categoria: "contratos",
        tags: "[]",
      }),
      { params },
    );

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "documentos",
      accion: "crear",
    });
  });

  it("creates the parent documento then its v1 when no documentoId is sent", async () => {
    const { insert, upload, rpc } = stubSupabase({ insertedDocumentoId: 42 });

    const response = await POST(
      makeRequest({
        file: makeFile(),
        nombre: "Acta",
        categoria: "contratos",
        descripcion: "Kickoff",
        tags: JSON.stringify(["legal"]),
      }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        cliente_id: 10,
        nombre: "Acta",
        categoria: "contratos",
        descripcion: "Kickoff",
        tags: ["legal"],
      }),
    );
    // Path is cliente-first, matching PR3's storage INSERT policy, which reads
    // (storage.foldername(name))[1] as the cliente id.
    expect(upload).toHaveBeenCalledWith(
      "10/42/1/acta.pdf",
      expect.anything(),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(rpc).toHaveBeenCalledWith("add_documento_version", {
      p_documento_id: 42,
      p_storage_path: "10/42/1/acta.pdf",
      p_original_filename: "acta.pdf",
      p_size_bytes: 10,
      p_mime_type: "application/pdf",
    });
  });

  it("appends the NEXT version to an existing documento, creating no parent row", async () => {
    const { insert, upload, rpc } = stubSupabase({ currentVersion: 2 });

    const response = await POST(
      makeRequest({ file: makeFile("acta-v3.pdf"), documentoId: "42" }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(insert).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith(
      "10/42/3/acta-v3.pdf",
      expect.anything(),
      expect.anything(),
    );
    expect(rpc).toHaveBeenCalledWith(
      "add_documento_version",
      expect.objectContaining({ p_documento_id: 42, p_storage_path: "10/42/3/acta-v3.pdf" }),
    );
  });

  it("treats a documento with no visible versions as starting at version 1", async () => {
    const { upload } = stubSupabase({ currentVersion: null });

    await POST(makeRequest({ file: makeFile(), documentoId: "42" }), {
      params,
    });

    expect(upload).toHaveBeenCalledWith(
      "10/42/1/acta.pdf",
      expect.anything(),
      expect.anything(),
    );
  });

  it("sanitizes the filename so a traversal attempt cannot escape the cliente folder", async () => {
    const { upload } = stubSupabase({ currentVersion: 1 });

    await POST(
      makeRequest({
        file: makeFile("../../etc/passwd"),
        documentoId: "42",
      }),
      { params },
    );

    expect(upload).toHaveBeenCalledWith(
      "10/42/2/passwd",
      expect.anything(),
      expect.anything(),
    );
  });

  it("rejects invalid metadata without uploading anything", async () => {
    const { upload, insert } = stubSupabase();

    const response = await POST(
      makeRequest({ file: makeFile(), nombre: "", categoria: "", tags: "[]" }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not record a version when the bytes failed to upload", async () => {
    const { rpc } = stubSupabase({
      currentVersion: 1,
      uploadError: { message: "denied" },
    });

    const response = await POST(
      makeRequest({ file: makeFile(), documentoId: "42" }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith(
      "add_documento_version",
      expect.anything(),
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports failure and does not revalidate when the version RPC is denied", async () => {
    stubSupabase({ currentVersion: 1, addVersionError: { message: "42501" } });

    const response = await POST(
      makeRequest({ file: makeFile(), documentoId: "42" }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the documentos tab after a successful upload", async () => {
    stubSupabase({ currentVersion: 1 });

    await POST(makeRequest({ file: makeFile(), documentoId: "42" }), {
      params,
    });

    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/10/documentos");
  });

  it("rejects a non-numeric cliente id", async () => {
    stubSupabase();

    const response = await POST(makeRequest({ file: makeFile() }), {
      params: Promise.resolve({ id: "not-a-number" }),
    });

    expect(response.status).toBe(400);
  });
});
