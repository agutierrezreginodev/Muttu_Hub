import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { postDocumentoUpload } from "@/lib/documentos/upload-client";

/**
 * `postDocumentoUpload` is the FIRST client-side `fetch` in this codebase
 * (every other mutation goes through a Server Action), so these tests pin the
 * exact multipart wire contract PR6's `upload/route.ts` has to honour on the
 * other side — field names, when `documentoId` is present, and how `tags` is
 * encoded.
 */
function mockFetch(response: {
  ok: boolean;
  body?: unknown;
  throws?: boolean;
}) {
  const fetchMock = vi.fn(async () => {
    if (response.throws) {
      throw new Error("network down");
    }
    return {
      ok: response.ok,
      json: async () => response.body ?? {},
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeFile() {
  return new File(["bytes"], "acta.pdf", { type: "application/pdf" });
}

describe("postDocumentoUpload (task 5b.1/5b.2, design Decision 6: byte transport via Route Handlers)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs multipart to the cliente's upload route", async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } });

    await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      metadata: { nombre: "Acta", categoria: "contratos", tags: [] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/crm/10/documentos/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("sends the file plus metadata and NO documentoId when creating a new document", async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } });

    await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      metadata: {
        nombre: "Acta",
        categoria: "contratos",
        descripcion: "Kickoff",
        tags: ["legal", "acta"],
      },
    });

    const body = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as FormData;
    expect((body.get("file") as File).name).toBe("acta.pdf");
    expect(body.get("nombre")).toBe("Acta");
    expect(body.get("categoria")).toBe("contratos");
    expect(body.get("descripcion")).toBe("Kickoff");
    // JSON-encoded so a tag containing a comma survives the round trip.
    expect(body.get("tags")).toBe(JSON.stringify(["legal", "acta"]));
    expect(body.get("documentoId")).toBeNull();
  });

  it("sends documentoId and the file only when adding a version to an existing document", async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } });

    await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      documentoId: 42,
    });

    const body = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as FormData;
    expect(body.get("documentoId")).toBe("42");
    expect((body.get("file") as File).name).toBe("acta.pdf");
    // Metadata belongs to the parent document and is never re-sent, so a new
    // version can't silently rename or recategorize its parent.
    expect(body.get("nombre")).toBeNull();
    expect(body.get("categoria")).toBeNull();
  });

  it("returns the server's own error message so the route decides the wording", async () => {
    mockFetch({
      ok: false,
      body: { error: "No tenés acceso a esa categoría." },
    });

    const result = await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      metadata: { nombre: "Acta", categoria: "secretos", tags: [] },
    });

    expect(result.error).toBe("No tenés acceso a esa categoría.");
  });

  it("falls back to the generic error when a failed response carries no message", async () => {
    mockFetch({ ok: false, body: {} });

    const result = await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      metadata: { nombre: "Acta", categoria: "contratos", tags: [] },
    });

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
  });

  it("never throws on a network failure — it returns the generic error", async () => {
    mockFetch({ ok: false, throws: true });

    const result = await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      metadata: { nombre: "Acta", categoria: "contratos", tags: [] },
    });

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
  });

  it("reports success with no error when the route accepts the upload", async () => {
    mockFetch({ ok: true, body: { success: true } });

    const result = await postDocumentoUpload({
      clienteId: 10,
      file: makeFile(),
      documentoId: 42,
    });

    expect(result.error).toBeUndefined();
  });
});
