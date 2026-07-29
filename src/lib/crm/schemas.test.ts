import { describe, expect, it } from "vitest";

import {
  clienteCreateSchema,
  clienteGeneralSchema,
  contactoSchema,
  oportunidadSchema,
} from "@/lib/crm/schemas";

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

describe("contactoSchema (task 7.3, spec CO1-CO3)", () => {
  it("accepts nombre only (every other field is optional)", () => {
    expect(contactoSchema.safeParse({ nombre: "Juan Pérez" }).success).toBe(
      true,
    );
  });

  it("accepts a fully populated contacto", () => {
    const result = contactoSchema.safeParse({
      nombre: "Juan Pérez",
      cargo: "Gerente",
      correo: "juan@example.com",
      telefono: "+57 300 123 4567",
      perfilDecision: "decisor",
      notas: "Contacto principal",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty nombre", () => {
    expect(contactoSchema.safeParse({ nombre: "" }).success).toBe(false);
  });

  it("rejects a malformed correo", () => {
    expect(
      contactoSchema.safeParse({ nombre: "Juan", correo: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("treats an empty-string correo as absent", () => {
    const result = contactoSchema.safeParse({ nombre: "Juan", correo: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.correo).toBeUndefined();
    }
  });
});

describe("oportunidadSchema (task 7.3, spec OP1-OP4)", () => {
  it("accepts nombre only, serviciosInteres defaults to an empty array", () => {
    const result = oportunidadSchema.safeParse({ nombre: "Migración cloud" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviciosInteres).toEqual([]);
    }
  });

  it("accepts a fully populated oportunidad with multiple servicios", () => {
    const result = oportunidadSchema.safeParse({
      nombre: "Migración cloud",
      problemaDetectado: "Infraestructura obsoleta",
      solucionPropuesta: "Migrar a la nube",
      proyectosAnteriores: "Ninguno",
      valorEstimadoCop: 50000000,
      estado: "abierta",
      fechaUltimaGestion: "2026-07-01",
      serviciosInteres: ["consultoria", "implementacion"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviciosInteres).toEqual([
        "consultoria",
        "implementacion",
      ]);
    }
  });

  it("rejects an empty nombre", () => {
    expect(oportunidadSchema.safeParse({ nombre: "" }).success).toBe(false);
  });

  it("rejects a negative valorEstimadoCop", () => {
    expect(
      oportunidadSchema.safeParse({ nombre: "X", valorEstimadoCop: -1 })
        .success,
    ).toBe(false);
  });

  it("treats an empty-string valorEstimadoCop as absent (HTML number input clears to '')", () => {
    const result = oportunidadSchema.safeParse({
      nombre: "X",
      valorEstimadoCop: "" as unknown as number,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valorEstimadoCop).toBeUndefined();
    }
  });

  it("rejects a malformed fechaUltimaGestion (not ISO date)", () => {
    expect(
      oportunidadSchema.safeParse({
        nombre: "X",
        fechaUltimaGestion: "01/07/2026",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty serviciosInteres array (deselecting every servicio is valid — set-replace with an empty set)", () => {
    const result = oportunidadSchema.safeParse({
      nombre: "X",
      serviciosInteres: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviciosInteres).toEqual([]);
    }
  });
});
