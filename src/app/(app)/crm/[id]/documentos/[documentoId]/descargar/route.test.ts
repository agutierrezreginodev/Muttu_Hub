// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { GET } from "./route";

const mockedCreateClient = vi.mocked(createClient);

interface StubOptions {
  /** Rows the `documento_version` read resolves to. */
  rows?: { storage_path: string }[];
  signedUrl?: string | null;
  signError?: unknown;
}

function stubSupabase({
  rows = [{ storage_path: "10/42/2/acta.pdf" }],
  signedUrl = "https://signed.example/acta.pdf",
  signError = null,
}: StubOptions = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };

  const createSignedUrl = vi.fn(async () => ({
    data: signError ? null : { signedUrl },
    error: signError,
  }));

  const from = vi.fn(() => builder as never);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateClient.mockResolvedValue({
    from,
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as any);

  return { builder, createSignedUrl, from };
}

function makeRequest(query = "") {
  return new Request(
    `http://localhost/crm/10/documentos/42/descargar${query}`,
  );
}

const params = Promise.resolve({ id: "10", documentoId: "42" });

describe("GET /crm/[id]/documentos/[documentoId]/descargar (task 6.3, spec document-library 'Single-document download')", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("redirects to a signed URL for the current version", async () => {
    const { createSignedUrl } = stubSupabase();

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://signed.example/acta.pdf",
    );
    expect(createSignedUrl).toHaveBeenCalledWith(
      "10/42/2/acta.pdf",
      expect.any(Number),
    );
  });

  it("resolves the CURRENT version by ordering version desc when no version is asked for", async () => {
    const { builder } = stubSupabase();

    await GET(makeRequest(), { params });

    expect(builder.order).toHaveBeenCalledWith("version", {
      ascending: false,
    });
    expect(builder.eq).toHaveBeenCalledWith("documento_id", 42);
  });

  it("serves the REQUESTED historic version, not the current one", async () => {
    const { builder, createSignedUrl } = stubSupabase({
      rows: [{ storage_path: "10/42/1/acta.pdf" }],
    });

    await GET(makeRequest("?version=1"), { params });

    // Spec: "the version-1 object is served (not silently redirected to the
    // current one)" — so the query must filter on the asked-for version.
    expect(builder.eq).toHaveBeenCalledWith("version", 1);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "10/42/1/acta.pdf",
      expect.any(Number),
    );
  });

  it("404s when the caller cannot see the document, minting no URL", async () => {
    const { createSignedUrl } = stubSupabase({ rows: [] });

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("404s when the requested version does not exist", async () => {
    const { createSignedUrl } = stubSupabase({ rows: [] });

    const response = await GET(makeRequest("?version=99"), { params });

    expect(response.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("404s rather than 500s when signing itself is denied", async () => {
    stubSupabase({ signError: { message: "denied" } });

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(404);
  });

  it("rejects a non-numeric version instead of silently serving the current one", async () => {
    const { createSignedUrl } = stubSupabase();

    const response = await GET(makeRequest("?version=abc"), { params });

    expect(response.status).toBe(400);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric documentoId", async () => {
    const { createSignedUrl } = stubSupabase();

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "10", documentoId: "nope" }),
    });

    expect(response.status).toBe(400);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
