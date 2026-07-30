import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  listDocumentos,
  listVersiones,
  listVersionesByCliente,
} from "@/lib/documentos/queries";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

/**
 * Minimal thenable Supabase query-builder stub: every chain method
 * (`select`/`eq`/`order`) returns the SAME object so calls compose freely,
 * and `then` resolves the final `{ data, error }` — mirrors the shape
 * `@supabase/postgrest-js`'s `PostgrestFilterBuilder` exposes to an
 * `await`ed call site, without pulling in a real Supabase client (task 4.3
 * establishes this mocking pattern; no prior `*.test.ts` in this codebase
 * unit-tests a Supabase-calling query function directly).
 */
function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return builder;
}

const mockedCreateClient = vi.mocked(createClient);

describe("listDocumentos (task 4.3/4.4, spec: List documents for a cliente)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("maps v_documento rows to camelCase DocumentoListItem shape", async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: 1,
          cliente_id: 701,
          nombre: "Acta de reunión",
          categoria: "contratos",
          descripcion: "Firmada",
          tags: ["legal"],
          current_version: 2,
          size_bytes: 2048,
          mime_type: "application/pdf",
          original_filename: "acta.pdf",
          uploaded_by: "user-1",
          current_uploaded_at: "2026-07-01T00:00:00Z",
          created_at: "2026-06-01T00:00:00Z",
          created_by: "user-1",
          updated_at: "2026-07-01T00:00:00Z",
          updated_by: "user-1",
        },
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    const result = await listDocumentos(701);

    expect(result).toEqual([
      {
        id: 1,
        clienteId: 701,
        nombre: "Acta de reunión",
        categoria: "contratos",
        descripcion: "Firmada",
        tags: ["legal"],
        currentVersion: 2,
        sizeBytes: 2048,
        mimeType: "application/pdf",
        originalFilename: "acta.pdf",
        uploadedBy: "user-1",
        currentUploadedAt: "2026-07-01T00:00:00Z",
        createdAt: "2026-06-01T00:00:00Z",
        createdBy: "user-1",
        updatedAt: "2026-07-01T00:00:00Z",
        updatedBy: "user-1",
      },
    ]);
  });

  it("filters by cliente_id via .eq()", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    await listDocumentos(701);

    expect(builder.eq).toHaveBeenCalledWith("cliente_id", 701);
  });

  it("trust-RLS: a denied SELECT returns an empty array, never throws (spec: Denied SELECT returns empty, not an error)", async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    await expect(listDocumentos(701)).resolves.toEqual([]);
  });
});

describe("listVersiones (task 4.3/4.4, spec document-versioning: Version history is retained and viewable)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("maps documento_version rows to camelCase DocumentoVersionListItem shape", async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: 10,
          documento_id: 42,
          version: 2,
          storage_bucket: "documentos",
          storage_path: "701/42/2/acta.pdf",
          original_filename: "acta.pdf",
          size_bytes: 2048,
          mime_type: "application/pdf",
          uploaded_by: "user-1",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    const result = await listVersiones(42);

    expect(result).toEqual([
      {
        id: 10,
        documentoId: 42,
        version: 2,
        storageBucket: "documentos",
        storagePath: "701/42/2/acta.pdf",
        originalFilename: "acta.pdf",
        sizeBytes: 2048,
        mimeType: "application/pdf",
        uploadedBy: "user-1",
        createdAt: "2026-07-01T00:00:00Z",
      },
    ]);
  });

  it("orders newest-first (spec: History lists all versions newest-first)", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    await listVersiones(42);

    expect(builder.order).toHaveBeenCalledWith("version", {
      ascending: false,
    });
  });

  it("trust-RLS: an invisible documento's versions return an empty array, never throw", async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    await expect(listVersiones(42)).resolves.toEqual([]);
  });
});

/**
 * `listVersionesByCliente` exists specifically to avoid an N+1: the documentos
 * tab renders one version-history dialog PER ROW, and calling `listVersiones`
 * once per document would fire one round trip per document on every page load
 * (for histories most users never open). `documento_version` carries a
 * DENORMALIZED `cliente_id` — the exact column the design added — so every
 * version for the cliente comes back in ONE query and is grouped in memory.
 */
describe("listVersionesByCliente (task 5b.2, one query instead of N)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  function versionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 10,
      documento_id: 42,
      version: 2,
      storage_bucket: "documentos",
      storage_path: "701/42/2/acta.pdf",
      original_filename: "acta.pdf",
      size_bytes: 2048,
      mime_type: "application/pdf",
      uploaded_by: "user-1",
      created_at: "2026-07-01T00:00:00Z",
      ...overrides,
    };
  }

  it("issues exactly ONE query, filtered on the denormalized cliente_id", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    const from = vi.fn(() => builder);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from } as any);

    await listVersionesByCliente(701);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("documento_version");
    expect(builder.eq).toHaveBeenCalledWith("cliente_id", 701);
  });

  it("groups versions by documento_id, keeping newest-first within each group", async () => {
    const builder = createQueryBuilder({
      data: [
        versionRow({ id: 11, documento_id: 42, version: 2 }),
        versionRow({ id: 10, documento_id: 42, version: 1 }),
        versionRow({ id: 20, documento_id: 43, version: 1 }),
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    const result = await listVersionesByCliente(701);

    expect(result.get(42)?.map((v) => v.version)).toEqual([2, 1]);
    expect(result.get(43)?.map((v) => v.version)).toEqual([1]);
    expect(result.get(42)?.[0].originalFilename).toBe("acta.pdf");
  });

  it("orders newest-first at the database, not in memory", async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    await listVersionesByCliente(701);

    expect(builder.order).toHaveBeenCalledWith("version", {
      ascending: false,
    });
  });

  it("trust-RLS: a denied SELECT yields an empty map, never throws", async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue({ from: vi.fn(() => builder) } as any);

    const result = await listVersionesByCliente(701);

    expect(result.size).toBe(0);
  });
});
