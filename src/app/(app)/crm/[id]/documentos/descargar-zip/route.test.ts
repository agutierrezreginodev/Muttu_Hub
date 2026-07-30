// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { unzipSync } from "fflate";

import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST, MAX_ZIP_DOCUMENTS, MAX_ZIP_TOTAL_BYTES } from "./route";

const mockedCreateClient = vi.mocked(createClient);

interface VersionRow {
  documento_id: number;
  version: number;
  storage_path: string;
  original_filename: string;
  size_bytes: number;
}

function versionRow(overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    documento_id: 1,
    version: 1,
    storage_path: "10/1/1/acta.pdf",
    original_filename: "acta.pdf",
    size_bytes: 10,
    ...overrides,
  };
}

function stubSupabase({
  allowed = true,
  rows = [versionRow()],
  downloadError = null as unknown,
}: {
  allowed?: boolean;
  rows?: VersionRow[];
  downloadError?: unknown;
} = {}) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(async () => ({ data: rows, error: null })),
  };

  const download = vi.fn(async () => ({
    data: downloadError ? null : new Blob(["some bytes"]),
    error: downloadError,
  }));

  const rpc = vi.fn(async () => ({ data: allowed, error: null }));
  const from = vi.fn(() => builder as never);

  const client = {
    rpc,
    from,
    storage: { from: vi.fn(() => ({ download })) },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateClient.mockResolvedValue(client as any);

  return { rpc, builder, download };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/crm/10/documentos/descargar-zip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = Promise.resolve({ id: "10" });

describe("POST /crm/[id]/documentos/descargar-zip (task 6.4/6.5, spec document-zip-export)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("denies without documentos.exportar and downloads nothing", async () => {
    const { download } = stubSupabase({ allowed: false });

    const response = await POST(makeRequest({ documentoIds: [1] }), { params });

    expect(response.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("gates on the exportar verb specifically, not ver", async () => {
    const { rpc } = stubSupabase();

    await POST(makeRequest({ documentoIds: [1] }), { params });

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "documentos",
      accion: "exportar",
    });
  });

  it("streams a valid zip containing the selected documents' current versions", async () => {
    stubSupabase({
      rows: [
        versionRow({ documento_id: 1, original_filename: "acta.pdf" }),
        versionRow({
          documento_id: 2,
          storage_path: "10/2/1/contrato.pdf",
          original_filename: "contrato.pdf",
        }),
      ],
    });

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(".zip");

    const buffer = new Uint8Array(await response.arrayBuffer());
    const entries = unzipSync(buffer);
    expect(Object.keys(entries).sort()).toEqual(["acta.pdf", "contrato.pdf"]);
  });

  it("keeps both entries when two selected documents share a filename", async () => {
    stubSupabase({
      rows: [
        versionRow({ documento_id: 1, original_filename: "acta.pdf" }),
        versionRow({
          documento_id: 2,
          storage_path: "10/2/1/acta.pdf",
          original_filename: "acta.pdf",
        }),
      ],
    });

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries)).toHaveLength(2);
    expect(Object.keys(entries).sort()).toEqual(["acta (2).pdf", "acta.pdf"]);
  });

  it("takes only the CURRENT version of each document, never every version", async () => {
    const { download } = stubSupabase({
      rows: [
        versionRow({
          documento_id: 1,
          version: 3,
          storage_path: "10/1/3/acta-v3.pdf",
          original_filename: "acta-v3.pdf",
        }),
        versionRow({
          documento_id: 1,
          version: 2,
          storage_path: "10/1/2/acta-v2.pdf",
        }),
        versionRow({ documento_id: 1, version: 1 }),
      ],
    });

    await POST(makeRequest({ documentoIds: [1] }), { params });

    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith("10/1/3/acta-v3.pdf");
  });

  it("silently excludes documents the caller cannot see, rather than failing the export", async () => {
    // The caller posted [1, 2] but RLS only returns document 1.
    const { download } = stubSupabase({
      rows: [versionRow({ documento_id: 1 })],
    });

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    expect(response.status).toBe(200);
    expect(download).toHaveBeenCalledTimes(1);
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(["acta.pdf"]);
  });

  it("returns 204 rather than a corrupt zip when nothing in the selection is visible", async () => {
    const { download } = stubSupabase({ rows: [] });

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    expect(response.status).toBe(204);
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses an over-count selection before querying or downloading anything", async () => {
    const { download, builder } = stubSupabase();

    const response = await POST(
      makeRequest({
        documentoIds: Array.from(
          { length: MAX_ZIP_DOCUMENTS + 1 },
          (_, index) => index + 1,
        ),
      }),
      { params },
    );

    expect(response.status).toBe(413);
    expect(builder.select).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses an over-size selection before downloading any bytes", async () => {
    const { download } = stubSupabase({
      rows: [
        versionRow({ documento_id: 1, size_bytes: MAX_ZIP_TOTAL_BYTES }),
        versionRow({
          documento_id: 2,
          storage_path: "10/2/1/otro.pdf",
          original_filename: "otro.pdf",
          size_bytes: 1,
        }),
      ],
    });

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    expect(response.status).toBe(413);
    // The cap is checked against size_bytes from the database, so it costs no
    // storage reads at all.
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    const { rpc } = stubSupabase();

    const response = await POST(makeRequest({ documentoIds: [] }), { params });

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    stubSupabase();

    const response = await POST(makeRequest({ documentoIds: "nope" }), {
      params,
    });

    expect(response.status).toBe(400);
  });

  it("omits an entry whose bytes fail to download instead of aborting the archive", async () => {
    stubSupabase({
      rows: [versionRow({ documento_id: 1 })],
      downloadError: { message: "gone" },
    });

    const response = await POST(makeRequest({ documentoIds: [1] }), { params });

    // NOT a 204: the response status is committed before any object is read,
    // which is inherent to streaming. The 204 case is the pre-stream one
    // (nothing in the selection was visible at all). What matters here is that
    // an unreadable object yields a VALID archive missing that entry, rather
    // than a corrupt or aborted download.
    expect(response.status).toBe(200);
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries)).toEqual([]);
  });

  it("still archives the readable entries when one object is unreadable", async () => {
    const rows = [
      versionRow({ documento_id: 1, original_filename: "acta.pdf" }),
      versionRow({
        documento_id: 2,
        storage_path: "10/2/1/roto.pdf",
        original_filename: "roto.pdf",
      }),
    ];

    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(async () => ({ data: rows, error: null })),
    };
    // Only the second object fails, simulating bytes orphaned by a failed
    // upload or a grant revoked mid-export.
    const download = vi.fn(async (path: string) => ({
      data: path === "10/2/1/roto.pdf" ? null : new Blob(["some bytes"]),
      error: path === "10/2/1/roto.pdf" ? { message: "gone" } : null,
    }));
    const client = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn(() => builder as never),
      storage: { from: vi.fn(() => ({ download })) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const response = await POST(makeRequest({ documentoIds: [1, 2] }), {
      params,
    });

    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(["acta.pdf"]);
  });
});
