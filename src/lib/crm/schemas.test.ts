import { describe, expect, it } from "vitest";

import { clienteCreateSchema, clienteGeneralSchema } from "@/lib/crm/schemas";

describe("clienteCreateSchema (task 6.4, task 6.7)", () => {
  it("accepts nombre only (tipo_cliente/estado are optional pickers)", () => {
    expect(clienteCreateSchema.safeParse({ nombre: "Acme Corp" }).success).toBe(
      true,
    );
  });

  it("accepts nombre + tipoCliente + estado", () => {
    expect(
      clienteCreateSchema.safeParse({
        nombre: "Acme Corp",
        tipoCliente: "pyme",
        estado: "activo",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty nombre", () => {
    expect(clienteCreateSchema.safeParse({ nombre: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only nombre", () => {
    expect(clienteCreateSchema.safeParse({ nombre: "   " }).success).toBe(
      false,
    );
  });
});

describe("clienteGeneralSchema (task 6.4, spec FC1 — all 9 PR2 columns)", () => {
  it("accepts every field empty (General tab starts blank)", () => {
    expect(clienteGeneralSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a fully populated General tab", () => {
    const result = clienteGeneralSchema.safeParse({
      empresa: "Acme Corp",
      tamanoOrganizacion: "grande",
      ubicacion: "Bogotá",
      canalContactoInicial: "referido",
      fechaPrimerContacto: "2026-01-15",
      prioridad: "Alta",
      nivelMadurez: "avanzado",
      prioridadesIdentificadas: "Escalar ventas",
      riesgosBarreras: "Presupuesto limitado",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed fechaPrimerContacto (not ISO date)", () => {
    expect(
      clienteGeneralSchema.safeParse({ fechaPrimerContacto: "15/01/2026" })
        .success,
    ).toBe(false);
  });

  it("treats an empty-string fechaPrimerContacto as absent (HTML date input clears to '')", () => {
    const result = clienteGeneralSchema.safeParse({ fechaPrimerContacto: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fechaPrimerContacto).toBeUndefined();
    }
  });

  it("treats whitespace-only free-text fields as absent", () => {
    const result = clienteGeneralSchema.safeParse({ empresa: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.empresa).toBeUndefined();
    }
  });
});
