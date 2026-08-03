import { describe, expect, it } from "vitest";

import {
  documentoMetadataSchema,
  documentoUploadMetadataSchema,
} from "@/lib/documentos/schemas";

/**
 * Task 4.1 (spec document-library "Document metadata model" +
 * document-versioning "Parent + version-row model"). Mirrors
 * `src/lib/crm/schemas.test.ts`'s conventions (`optionalTrimmed` behavior,
 * empty-string-as-absent). `categoria` is required here as the earlier,
 * friendlier gate — the real enforcement is the NOT NULL + composite FK to
 * `catalogo` (spec "A document requires a category" / "Category is a
 * catalog FK").
 */
describe("documentoMetadataSchema (task 4.1, spec: Document metadata model)", () => {
  it("accepts nombre + categoria only, tags defaults to an empty array", () => {
    const result = documentoMetadataSchema.safeParse({
      nombre: "Acta de reunión",
      categoria: "contratos",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it("accepts a fully populated document", () => {
    const result = documentoMetadataSchema.safeParse({
      nombre: "Acta de reunión",
      categoria: "contratos",
      descripcion: "Acta firmada por ambas partes",
      tags: ["legal", "firmado"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["legal", "firmado"]);
    }
  });

  it("rejects an empty nombre", () => {
    expect(
      documentoMetadataSchema.safeParse({ nombre: "", categoria: "contratos" })
        .success,
    ).toBe(false);
  });

  it("rejects a whitespace-only nombre", () => {
    expect(
      documentoMetadataSchema.safeParse({
        nombre: "   ",
        categoria: "contratos",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing categoria — the DB gating axis cannot be absent", () => {
    expect(
      documentoMetadataSchema.safeParse({ nombre: "Acta de reunión" }).success,
    ).toBe(false);
  });

  it("rejects an empty categoria", () => {
    expect(
      documentoMetadataSchema.safeParse({
        nombre: "Acta de reunión",
        categoria: "",
      }).success,
    ).toBe(false);
  });

  it("treats an empty-string descripcion as absent", () => {
    const result = documentoMetadataSchema.safeParse({
      nombre: "Acta de reunión",
      categoria: "contratos",
      descripcion: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.descripcion).toBeUndefined();
    }
  });

  it("trims descripcion", () => {
    const result = documentoMetadataSchema.safeParse({
      nombre: "Acta de reunión",
      categoria: "contratos",
      descripcion: "  Nota  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.descripcion).toBe("Nota");
    }
  });

  it("rejects a blank tag inside the tags array", () => {
    expect(
      documentoMetadataSchema.safeParse({
        nombre: "Acta de reunión",
        categoria: "contratos",
        tags: ["legal", "   "],
      }).success,
    ).toBe(false);
  });

  it("accepts an empty tags array (deselecting every tag is valid)", () => {
    const result = documentoMetadataSchema.safeParse({
      nombre: "Acta de reunión",
      categoria: "contratos",
      tags: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });
});

/**
 * Task 4.1: upload metadata shape (mime/size). This validates SHAPE only
 * (non-empty filename/mime, non-negative integer size) — it deliberately
 * does NOT enforce a size cap or a mime allow-list: open question 6
 * (per-bucket mime/size restriction) is still unresolved by the owner
 * (see PR3's task 3.3, explicitly skipped). `size_bytes >= 0` here mirrors
 * the DB's own CHECK constraint on `documento_version.size_bytes`
 * (design Data Model).
 */
describe("documentoUploadMetadataSchema (task 4.1, spec document-versioning)", () => {
  it("accepts a valid upload metadata shape", () => {
    const result = documentoUploadMetadataSchema.safeParse({
      originalFilename: "acta.pdf",
      sizeBytes: 102_400,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a zero-byte file (size_bytes >= 0, per the DB CHECK)", () => {
    expect(
      documentoUploadMetadataSchema.safeParse({
        originalFilename: "vacio.txt",
        sizeBytes: 0,
        mimeType: "text/plain",
      }).success,
    ).toBe(true);
  });

  it("rejects a negative sizeBytes", () => {
    expect(
      documentoUploadMetadataSchema.safeParse({
        originalFilename: "acta.pdf",
        sizeBytes: -1,
        mimeType: "application/pdf",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-integer sizeBytes", () => {
    expect(
      documentoUploadMetadataSchema.safeParse({
        originalFilename: "acta.pdf",
        sizeBytes: 1.5,
        mimeType: "application/pdf",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty originalFilename", () => {
    expect(
      documentoUploadMetadataSchema.safeParse({
        originalFilename: "",
        sizeBytes: 100,
        mimeType: "application/pdf",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty mimeType", () => {
    expect(
      documentoUploadMetadataSchema.safeParse({
        originalFilename: "acta.pdf",
        sizeBytes: 100,
        mimeType: "",
      }).success,
    ).toBe(false);
  });
});
