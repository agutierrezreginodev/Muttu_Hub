import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { requestDocumentoZip } from "@/lib/documentos/zip-client";

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  blob?: Blob;
  throws?: boolean;
}) {
  const fetchMock = vi.fn(async () => {
    if (response.throws) {
      throw new Error("network down");
    }
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body ?? {},
      blob: async () => response.blob ?? new Blob(["zip bytes"]),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("requestDocumentoZip (task 6.6, spec document-zip-export)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:zip"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the selection as JSON to the cliente's zip route", async () => {
    const fetchMock = mockFetch({});

    await requestDocumentoZip({ clienteId: 10, documentoIds: [1, 2] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/crm/10/documentos/descargar-zip");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ documentoIds: [1, 2] }));
  });

  it("refuses an empty selection without calling the route", async () => {
    const fetchMock = mockFetch({});

    const result = await requestDocumentoZip({
      clienteId: 10,
      documentoIds: [],
    });

    expect(result.error).toBe("Seleccioná al menos un documento.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("triggers the browser download on success", async () => {
    mockFetch({});
    const clickSpy = vi.fn();
    const anchor = document.createElement("a");
    anchor.click = clickSpy;
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(anchor);

    const result = await requestDocumentoZip({
      clienteId: 10,
      documentoIds: [1],
    });

    expect(result.error).toBeUndefined();
    expect(clickSpy).toHaveBeenCalled();
    expect(anchor.download).toContain(".zip");
    createElementSpy.mockRestore();
  });

  it("reports the empty-result case distinctly from a failure", async () => {
    mockFetch({ ok: true, status: 204 });

    const result = await requestDocumentoZip({
      clienteId: 10,
      documentoIds: [1],
    });

    // 204 means the selection was visible to nobody — not an error condition on
    // the server, but the user still needs to be told nothing was downloaded.
    expect(result.error).toBe("No hay documentos disponibles para descargar.");
  });

  it("passes the route's own error message through, so a cap refusal reads correctly", async () => {
    mockFetch({
      ok: false,
      status: 413,
      body: { error: "Seleccionaste demasiados documentos. Probá con menos." },
    });

    const result = await requestDocumentoZip({
      clienteId: 10,
      documentoIds: [1],
    });

    expect(result.error).toBe(
      "Seleccionaste demasiados documentos. Probá con menos.",
    );
  });

  it("never throws on a network failure", async () => {
    mockFetch({ throws: true });

    const result = await requestDocumentoZip({
      clienteId: 10,
      documentoIds: [1],
    });

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
  });
});
