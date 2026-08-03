import { describe, expect, it } from "vitest";

import {
  comentarioSchema,
  etiquetasSchema,
  tareaCreateSchema,
  tareaUpdateSchema,
} from "@/lib/kanban/schemas";

/**
 * Slice 4a (tasks: sdd/kanban-module/tasks, spec KT1/KT2/KC4).
 */
describe("tareaCreateSchema (spec KT1/KT2 — responsable is REQUIRED, unlike CRM's compromisoSchema)", () => {
  it("accepts titulo + responsableId (the minimum KT1 requires)", () => {
    expect(
      tareaCreateSchema.safeParse({
        titulo: "Preparar propuesta",
        responsableId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("rejects a create with no responsableId at all — Kanban never writes estado='borrador'", () => {
    const result = tareaCreateSchema.safeParse({ titulo: "Preparar propuesta" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string responsableId", () => {
    expect(
      tareaCreateSchema.safeParse({
        titulo: "Preparar propuesta",
        responsableId: "",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty titulo", () => {
    expect(
      tareaCreateSchema.safeParse({
        titulo: "",
        responsableId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("accepts every KT2 field populated", () => {
    const result = tareaCreateSchema.safeParse({
      titulo: "Preparar propuesta",
      descripcion: "Revisar el alcance con el cliente",
      responsableId: "00000000-0000-0000-0000-000000000001",
      fechaLimite: "2026-08-15",
      prioridad: "Alta",
      etiquetas: ["comercial", "proyecto"],
      clienteId: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed fechaLimite (not ISO date)", () => {
    expect(
      tareaCreateSchema.safeParse({
        titulo: "Preparar propuesta",
        responsableId: "00000000-0000-0000-0000-000000000001",
        fechaLimite: "15/08/2026",
      }).success,
    ).toBe(false);
  });

  it("etiquetas defaults to an empty array when omitted", () => {
    const result = tareaCreateSchema.safeParse({
      titulo: "Preparar propuesta",
      responsableId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.etiquetas).toEqual([]);
    }
  });
});

describe("tareaUpdateSchema (spec KT1 — responsable stays required on edit too)", () => {
  it("accepts the same minimum as create", () => {
    expect(
      tareaUpdateSchema.safeParse({
        titulo: "Preparar propuesta",
        responsableId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing responsableId, same as create — KT1 applies to create AND edit", () => {
    expect(
      tareaUpdateSchema.safeParse({ titulo: "Preparar propuesta" }).success,
    ).toBe(false);
  });
});

describe("comentarioSchema (mirrors crm's bitacoraSchema exactly — spec KM1's non-blank CHECK)", () => {
  it("accepts a non-empty texto", () => {
    expect(
      comentarioSchema.safeParse({ texto: "Avance del día" }).success,
    ).toBe(true);
  });

  it("rejects an empty texto", () => {
    expect(comentarioSchema.safeParse({ texto: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only texto (mirrors the DB's own non-blank CHECK)", () => {
    expect(comentarioSchema.safeParse({ texto: "   " }).success).toBe(false);
  });

  it("never accepts an autorId field — it does not exist on this schema at all", () => {
    expect(Object.keys(comentarioSchema.shape)).toEqual(["texto"]);
  });
});

describe("etiquetasSchema (spec KC4/D4 — validates against ACTIVE etiqueta_tarea codes only)", () => {
  const activos = ["comercial", "administrativo"];

  it("accepts an empty array", () => {
    expect(etiquetasSchema(activos).safeParse([]).success).toBe(true);
  });

  it("accepts a subset of active codes", () => {
    expect(etiquetasSchema(activos).safeParse(["comercial"]).success).toBe(
      true,
    );
  });

  it("rejects a code that is not in the active set (inactive or unknown)", () => {
    const result = etiquetasSchema(activos).safeParse(["interno"]);
    expect(result.success).toBe(false);
  });

  it("rejects a mix of one active and one inactive code — the whole write is rejected, not silently filtered", () => {
    expect(
      etiquetasSchema(activos).safeParse(["comercial", "interno"]).success,
    ).toBe(false);
  });
});
