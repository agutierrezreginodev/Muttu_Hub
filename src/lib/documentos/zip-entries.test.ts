import { describe, expect, it } from "vitest";

import { buildZipEntryNames } from "@/lib/documentos/zip-entries";

describe("buildZipEntryNames (task 6.4, spec document-zip-export 'Zip entry naming avoids collisions')", () => {
  it("keeps distinct filenames untouched", () => {
    expect(buildZipEntryNames(["acta.pdf", "contrato.pdf"])).toEqual([
      "acta.pdf",
      "contrato.pdf",
    ]);
  });

  it("de-duplicates a repeated filename so neither entry overwrites the other", () => {
    expect(buildZipEntryNames(["acta.pdf", "acta.pdf"])).toEqual([
      "acta.pdf",
      "acta (2).pdf",
    ]);
  });

  it("keeps counting past the second collision", () => {
    expect(buildZipEntryNames(["acta.pdf", "acta.pdf", "acta.pdf"])).toEqual([
      "acta.pdf",
      "acta (2).pdf",
      "acta (3).pdf",
    ]);
  });

  it("inserts the suffix before the extension, never after it", () => {
    const [, second] = buildZipEntryNames(["informe.tar.gz", "informe.tar.gz"]);
    // Only the LAST dot is an extension boundary, so the suffix lands before
    // `.gz` — the file still opens as a gzip.
    expect(second).toBe("informe.tar (2).gz");
  });

  it("handles a filename with no extension", () => {
    expect(buildZipEntryNames(["README", "README"])).toEqual([
      "README",
      "README (2)",
    ]);
  });

  it("never produces a duplicate even when the de-duplicated name itself collides", () => {
    // A real selection can genuinely contain "acta (2).pdf" alongside two
    // "acta.pdf" — the naive suffix would collide with the existing name.
    const names = buildZipEntryNames(["acta.pdf", "acta (2).pdf", "acta.pdf"]);
    expect(new Set(names).size).toBe(3);
  });

  it("sanitizes names so no entry can escape the archive root", () => {
    const [name] = buildZipEntryNames(["../../etc/passwd"]);
    expect(name).toBe("passwd");
  });

  it("returns an empty list for an empty selection", () => {
    expect(buildZipEntryNames([])).toEqual([]);
  });
});
