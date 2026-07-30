import { describe, expect, it } from "vitest";

import {
  buildDocumentoStoragePath,
  sanitizeStorageFilename,
} from "@/lib/documentos/storage-paths";

/**
 * Task 4.5 (design "Storage layout", spec document-library "Storage layout
 * and bucket"): `cliente_id` MUST be the first path segment because PR3's
 * storage INSERT policy reads `(storage.foldername(name))[1]` as the
 * cliente id (apply-progress carry-forward note). Getting the segment
 * order wrong breaks upload auth silently (every upload would be gated by
 * the wrong cliente).
 */
describe("buildDocumentoStoragePath (task 4.5)", () => {
  it("builds {cliente_id}/{documento_id}/{version}/{filename} — cliente_id FIRST", () => {
    expect(buildDocumentoStoragePath(701, 42, 3, "acta.pdf")).toBe(
      "701/42/3/acta.pdf",
    );
  });

  it("sanitizes the filename segment (spaces, unsafe characters)", () => {
    expect(
      buildDocumentoStoragePath(701, 42, 1, "acta firmada (final).pdf"),
    ).toBe("701/42/1/acta_firmada_final.pdf");
  });

  it("never lets the filename escape its version segment via path traversal", () => {
    expect(buildDocumentoStoragePath(701, 42, 1, "../../etc/passwd")).toBe(
      "701/42/1/passwd",
    );
  });
});

/**
 * Task 4.5: pure filename sanitizer. The raw filename becomes the LAST
 * storage path segment (see buildDocumentoStoragePath) — collisions between
 * two selections that sanitize to the same name are handled at the
 * zip-entry-naming level (PR6), NOT here: every upload already has its own
 * `{version}` segment, so same-named files never collide within one
 * document's history.
 */
describe("sanitizeStorageFilename (task 4.5)", () => {
  it("keeps a already-safe filename unchanged", () => {
    expect(sanitizeStorageFilename("acta.pdf")).toBe("acta.pdf");
  });

  it("collapses whitespace to underscores", () => {
    expect(sanitizeStorageFilename("acta   firmada.pdf")).toBe(
      "acta_firmada.pdf",
    );
  });

  it("strips characters outside the safe set, keeping the extension", () => {
    expect(sanitizeStorageFilename("acta (v2)#final!.pdf")).toBe(
      "acta_v2final.pdf",
    );
  });

  it("strips path separators — only the last segment survives", () => {
    expect(sanitizeStorageFilename("../secret/acta.pdf")).toBe("acta.pdf");
    expect(sanitizeStorageFilename("C:\\Users\\acta.pdf")).toBe("acta.pdf");
  });

  it("trims leading/trailing whitespace before sanitizing", () => {
    expect(sanitizeStorageFilename("  acta.pdf  ")).toBe("acta.pdf");
  });

  it("falls back to a safe default when nothing survives sanitization", () => {
    expect(sanitizeStorageFilename("###???")).toBe("documento");
  });

  it("preserves accented/ñ characters by transliterating rather than dropping (avoids empty/garbled names for common Spanish filenames)", () => {
    expect(sanitizeStorageFilename("informe_señal.pdf")).toBe(
      "informe_senal.pdf",
    );
  });
});
