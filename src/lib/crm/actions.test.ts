import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session/get-session-context";
import { emptyPermisosGrid } from "@/lib/permissions";
import { es } from "@/messages/es";
import {
  createClienteAction,
  updateClienteGeneralAction,
  createContactoAction,
  updateContactoAction,
  deleteContactoAction,
  setOportunidadServiciosAction,
  createOportunidadAction,
  updateOportunidadAction,
  deleteOportunidadAction,
  addBitacoraEntryAction,
  createCompromisoAction,
} from "@/lib/crm/actions";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/session/get-session-context", () => ({
  getSessionContext: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetSessionContext = vi.mocked(getSessionContext);

/**
 * Mirrors `documentos/actions.test.ts`'s mocking shape, generalized: every
 * CRM action re-checks `has_permission('crm', accion)` via `rpc()` as its
 * own pre-check (`assertCrmPermission`) before ever touching `.from()`.
 * `rpcHandler` lets a test answer non-`has_permission` RPCs (soft deletes,
 * `set_oportunidad_servicios`) and `fromHandler` lets a test answer a
 * specific table's builder chain — everything else defaults to a harmless
 * empty object so unrelated calls don't throw.
 */
function buildSupabaseMock(options: {
  hasPermission: boolean | ((accion: string) => boolean);
  rpcHandler?: (
    name: string,
    args: unknown,
  ) => { data?: unknown; error?: unknown } | undefined;
  fromHandler?: (table: string) => unknown;
}) {
  const rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "has_permission") {
      const accion = (args as { accion?: string } | undefined)?.accion ?? "";
      const allowed =
        typeof options.hasPermission === "function"
          ? options.hasPermission(accion)
          : options.hasPermission;
      return Promise.resolve({ data: allowed, error: null });
    }
    const result = options.rpcHandler?.(name, args) ?? {
      data: null,
      error: null,
    };
    return Promise.resolve(result);
  });
  const from = vi.fn((table: string) => options.fromHandler?.(table) ?? {});
  return { rpc, from };
}

function insertOnly(result: { error?: unknown } = {}) {
  const insert = vi.fn(() => Promise.resolve({ error: result.error ?? null }));
  return { insert };
}

function updateEq(result: { error?: unknown } = {}) {
  const eq = vi.fn(() => Promise.resolve({ error: result.error ?? null }));
  const update = vi.fn(() => ({ eq }));
  return { update, eq };
}

function insertSelectSingle(result: { data?: unknown; error?: unknown }) {
  const single = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

// `permisos` must be a COMPLETE grid: SessionContext types it as every module
// present, so `{}` compiles under vitest (which never typechecks) but fails
// `tsc --noEmit`, and therefore CI's static-checks job. The grid's contents are
// irrelevant here — these tests drive the gate through the mocked
// `has_permission` RPC, not through this object.
const SESSION = {
  userId: "user-1",
  nombre: "Ana",
  email: "ana@test.com",
  rolId: 1,
  rolNombre: "Comercial",
  permisos: emptyPermisosGrid(),
};

beforeEach(() => {
  mockedCreateClient.mockReset();
  mockedGetSessionContext.mockReset();
  revalidatePathMock.mockReset();
});

// ---------------------------------------------------------------------------
// createClienteAction
// ---------------------------------------------------------------------------
describe("createClienteAction", () => {
  it("denies without crm.crear and never attempts the insert", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createClienteAction({ nombre: "Acme" });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
    expect(builder.insert).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("checks has_permission('crm','crear') as the pre-check", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    await createClienteAction({ nombre: "Acme" });

    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "crm",
      accion: "crear",
    });
  });

  it("rejects an empty nombre before ever reaching Supabase", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createClienteAction({ nombre: "   " });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("inserts nombre/tipo_cliente/estado and revalidates /crm on success", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createClienteAction({
      nombre: "Acme",
      tipoCliente: "empresa",
      estado: "activo",
    });

    expect(client.from).toHaveBeenCalledWith("cliente");
    expect(builder.insert).toHaveBeenCalledWith({
      nombre: "Acme",
      tipo_cliente: "empresa",
      estado: "activo",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm");
    expect(result.success).toBe(true);
  });

  it("omits the estado key entirely when not provided (lets the DB default apply)", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    await createClienteAction({ nombre: "Acme" });

    expect(builder.insert).toHaveBeenCalledWith({
      nombre: "Acme",
      tipo_cliente: null,
    });
  });

  it("surfaces a generic error when the insert itself fails and never revalidates", async () => {
    const builder = insertOnly({ error: { message: "permission denied" } });
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createClienteAction({ nombre: "Acme" });

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateClienteGeneralAction
// ---------------------------------------------------------------------------
describe("updateClienteGeneralAction", () => {
  it("denies without crm.editar and never attempts the update", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateClienteGeneralAction(701, { empresa: "Acme" });

    expect(result.error).toBeTruthy();
    expect(builder.update).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "crm",
      accion: "editar",
    });
  });

  it("rejects a malformed fechaPrimerContacto before ever reaching Supabase", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateClienteGeneralAction(701, {
      fechaPrimerContacto: "not-a-date",
    });

    expect(result.error).toBeTruthy();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("updates the 9 General-tab columns and revalidates /crm/{id} on success", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateClienteGeneralAction(701, {
      empresa: "Acme",
      prioridad: "alta",
    });

    expect(client.from).toHaveBeenCalledWith("cliente");
    expect(builder.update).toHaveBeenCalledWith({
      empresa: "Acme",
      tamano_organizacion: null,
      ubicacion: null,
      canal_contacto_inicial: null,
      fecha_primer_contacto: null,
      prioridad: "alta",
      nivel_madurez: null,
      prioridades_identificadas: null,
      riesgos_barreras: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", 701);
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the update itself fails", async () => {
    const builder = updateEq({ error: { message: "denied" } });
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateClienteGeneralAction(701, { empresa: "Acme" });

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createContactoAction
// ---------------------------------------------------------------------------
describe("createContactoAction", () => {
  it("denies without crm.crear and never attempts the insert", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createContactoAction(701, { nombre: "Juan" });

    expect(result.error).toBeTruthy();
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid correo before ever reaching Supabase", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createContactoAction(701, {
      nombre: "Juan",
      correo: "not-an-email",
    });

    expect(result.error).toBe(es.crm.contactos.correoInvalid);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("inserts the contacto scoped to cliente_id and revalidates the contactos tab", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createContactoAction(701, {
      nombre: "Juan",
      correo: "juan@acme.com",
    });

    expect(client.from).toHaveBeenCalledWith("contacto");
    expect(builder.insert).toHaveBeenCalledWith({
      cliente_id: 701,
      nombre: "Juan",
      cargo: null,
      correo: "juan@acme.com",
      telefono: null,
      perfil_decision: null,
      notas: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/contactos");
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateContactoAction
// ---------------------------------------------------------------------------
describe("updateContactoAction", () => {
  it("denies without crm.editar and never attempts the update", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateContactoAction(701, 42, { nombre: "Juan" });

    expect(result.error).toBeTruthy();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("rejects an empty nombre before ever reaching Supabase", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateContactoAction(701, 42, { nombre: "" });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("updates by contacto id and revalidates the contactos tab", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateContactoAction(701, 42, {
      nombre: "Juan Actualizado",
      cargo: "CTO",
    });

    expect(client.from).toHaveBeenCalledWith("contacto");
    expect(builder.update).toHaveBeenCalledWith({
      nombre: "Juan Actualizado",
      cargo: "CTO",
      correo: null,
      telefono: null,
      perfil_decision: null,
      notas: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", 42);
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/contactos");
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteContactoAction
// ---------------------------------------------------------------------------
describe("deleteContactoAction", () => {
  it("denies without crm.eliminar and never calls the soft-delete RPC", async () => {
    const rpcHandler = vi.fn();
    const client = buildSupabaseMock({ hasPermission: false, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteContactoAction(701, 42);

    expect(result.error).toBeTruthy();
    expect(rpcHandler).not.toHaveBeenCalled();
  });

  it("calls public.soft_delete_contacto and revalidates on success", async () => {
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteContactoAction(701, 42);

    expect(client.rpc).toHaveBeenCalledWith("soft_delete_contacto", {
      p_id: 42,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/contactos");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the RPC itself fails and never revalidates", async () => {
    const rpcHandler = vi.fn(() => ({
      data: null,
      error: { message: "denied", code: "42501" },
    }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteContactoAction(701, 42);

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setOportunidadServiciosAction — the delete-then-insert full-set-replace
// seam every create/update oportunidad path funnels through.
// ---------------------------------------------------------------------------
describe("setOportunidadServiciosAction", () => {
  it("denies without crm.editar and never calls the RPC", async () => {
    const rpcHandler = vi.fn();
    const client = buildSupabaseMock({ hasPermission: false, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await setOportunidadServiciosAction(701, 9, ["consultoria"]);

    expect(result.error).toBeTruthy();
    expect(rpcHandler).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("checks has_permission('crm','editar') as the pre-check (not 'crear')", async () => {
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    await setOportunidadServiciosAction(701, 9, ["consultoria"]);

    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "crm",
      accion: "editar",
    });
  });

  it("replaces a non-empty set: forwards the full codigos array to the RPC verbatim", async () => {
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await setOportunidadServiciosAction(701, 9, [
      "consultoria",
      "capacitacion",
    ]);

    expect(client.rpc).toHaveBeenCalledWith("set_oportunidad_servicios", {
      p_oportunidad_id: 9,
      p_codigos: ["consultoria", "capacitacion"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/oportunidades");
    expect(result.success).toBe(true);
  });

  it("replacing with an EMPTY array wipes the whole set — no guard stops this at the action layer", async () => {
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await setOportunidadServiciosAction(701, 9, []);

    // The action forwards an empty array exactly like any other array: it
    // performs NO length check, NO confirmation, and NO special-casing
    // before calling the RPC. Whether this is "intended" (full-set-replace
    // by design) or a footgun depends entirely on every caller always
    // passing the form's complete current state — see the reported finding
    // about `oportunidadSchema.serviciosInteres`'s `.default([])`.
    expect(client.rpc).toHaveBeenCalledWith("set_oportunidad_servicios", {
      p_oportunidad_id: 9,
      p_codigos: [],
    });
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the RPC fails and never revalidates", async () => {
    const rpcHandler = vi.fn(() => ({
      data: null,
      error: { message: "denied" },
    }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await setOportunidadServiciosAction(701, 9, ["consultoria"]);

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createOportunidadAction
// ---------------------------------------------------------------------------
const OPORTUNIDAD_INPUT = {
  nombre: "Nueva oportunidad",
  serviciosInteres: ["consultoria"],
};

describe("createOportunidadAction", () => {
  it("denies without crm.crear and never attempts the insert", async () => {
    const builder = insertSelectSingle({ data: { id: 9 } });
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createOportunidadAction(701, OPORTUNIDAD_INPUT);

    expect(result.error).toBeTruthy();
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty nombre before ever reaching Supabase", async () => {
    const builder = insertSelectSingle({ data: { id: 9 } });
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createOportunidadAction(701, {
      ...OPORTUNIDAD_INPUT,
      nombre: "",
    });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("inserts the row, then applies the full servicios set, then revalidates once (allowed end-to-end)", async () => {
    const builder = insertSelectSingle({ data: { id: 9 } });
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createOportunidadAction(701, {
      ...OPORTUNIDAD_INPUT,
      serviciosInteres: ["consultoria", "capacitacion"],
    });

    expect(client.from).toHaveBeenCalledWith("oportunidad");
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        cliente_id: 701,
        nombre: "Nueva oportunidad",
      }),
    );
    expect(client.rpc).toHaveBeenCalledWith("set_oportunidad_servicios", {
      p_oportunidad_id: 9,
      p_codigos: ["consultoria", "capacitacion"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/oportunidades");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the row insert fails and never attempts the servicios RPC", async () => {
    const builder = insertSelectSingle({ error: { message: "denied" } });
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createOportunidadAction(701, OPORTUNIDAD_INPUT);

    expect(result.error).toBe(es.common.genericError);
    expect(rpcHandler).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a crear-only caller (no crm.editar) completes the whole create, servicios included", async () => {
    // This used to be a partial write. `createOportunidadAction` gates on
    // `crear`, but the servicios step went through
    // setOportunidadServiciosAction, which independently re-checked `editar`.
    // A role holding crear WITHOUT editar therefore had `oportunidad.insert()`
    // commit and only THEN got denied, leaving a row with an empty servicios
    // set while the UI reported failure.
    //
    // The servicios write now runs through the ungated `applyServiciosInteres`
    // helper under the create path's own `crear` gate, so the operation either
    // completes fully or never writes. Setting the servicios of an oportunidad
    // you are creating is part of creating it.
    const builder = insertSelectSingle({ data: { id: 9 } });
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({
      hasPermission: (accion) => accion === "crear",
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await createOportunidadAction(701, OPORTUNIDAD_INPUT);

    expect(builder.insert).toHaveBeenCalled();
    // The servicios RPC is now REACHED under the crear gate, not denied by a
    // second editar check.
    expect(rpcHandler).toHaveBeenCalledWith("set_oportunidad_servicios", {
      p_oportunidad_id: 9,
      p_codigos: OPORTUNIDAD_INPUT.serviciosInteres,
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/oportunidades");
  });
});

// ---------------------------------------------------------------------------
// updateOportunidadAction
// ---------------------------------------------------------------------------
describe("updateOportunidadAction", () => {
  it("denies without crm.editar and never attempts the update", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateOportunidadAction(701, 9, OPORTUNIDAD_INPUT);

    expect(result.error).toBeTruthy();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("rejects an empty nombre before ever reaching Supabase", async () => {
    const builder = updateEq();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateOportunidadAction(701, 9, {
      ...OPORTUNIDAD_INPUT,
      nombre: "",
    });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("updates the row fields, then re-applies the full servicios set, then revalidates (allowed)", async () => {
    const builder = updateEq();
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateOportunidadAction(701, 9, {
      ...OPORTUNIDAD_INPUT,
      serviciosInteres: ["consultoria"],
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Nueva oportunidad" }),
    );
    expect(builder.eq).toHaveBeenCalledWith("id", 9);
    expect(client.rpc).toHaveBeenCalledWith("set_oportunidad_servicios", {
      p_oportunidad_id: 9,
      p_codigos: ["consultoria"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/oportunidades");
    expect(result.success).toBe(true);
  });

  it("KNOWN LIMITATION: the row UPDATE stays committed when the servicios RPC fails at the DB layer", async () => {
    // Pins a DISCLOSED limitation, not an unnoticed bug. The permission half of
    // the old partial-write defect is fixed (see the crear-only regression test
    // above); this is the half that remains, and it cannot be fixed in
    // application code.
    //
    // The permission gate passes and the denial comes from the RPC itself — a
    // bad catalog code, an RLS rejection, any DB-layer failure. The field
    // update and the servicios RPC are two separate statements, so they are two
    // separate implicit transactions: the update has already committed by the
    // time the RPC fails, and nothing can roll it back from here.
    //
    // Closing it properly needs both writes inside ONE Postgres function, i.e. a
    // new migration plus its pgTAP suite. Until then this test documents the
    // real behavior so a future change cannot silently alter it.
    const builder = updateEq();
    const rpcHandler = vi.fn((name: string) => {
      if (name === "set_oportunidad_servicios") {
        return { data: null, error: { message: "denied" } };
      }
      return { data: null, error: null };
    });
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateOportunidadAction(701, 9, OPORTUNIDAD_INPUT);

    expect(builder.update).toHaveBeenCalled(); // <- the field update DID happen
    expect(builder.eq).toHaveBeenCalledWith("id", 9);
    expect(result.error).toBeTruthy(); // yet the action reports failure
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces a generic error when the row update itself fails and never attempts the servicios RPC", async () => {
    const builder = updateEq({ error: { message: "denied" } });
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
      rpcHandler,
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await updateOportunidadAction(701, 9, OPORTUNIDAD_INPUT);

    expect(result.error).toBe(es.common.genericError);
    expect(rpcHandler).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteOportunidadAction
// ---------------------------------------------------------------------------
describe("deleteOportunidadAction", () => {
  it("denies without crm.eliminar and never calls the soft-delete RPC", async () => {
    const rpcHandler = vi.fn();
    const client = buildSupabaseMock({ hasPermission: false, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteOportunidadAction(701, 9);

    expect(result.error).toBeTruthy();
    expect(rpcHandler).not.toHaveBeenCalled();
  });

  it("calls public.soft_delete_oportunidad and revalidates on success", async () => {
    const rpcHandler = vi.fn(() => ({ data: null, error: null }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteOportunidadAction(701, 9);

    expect(client.rpc).toHaveBeenCalledWith("soft_delete_oportunidad", {
      p_id: 9,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/oportunidades");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the RPC itself fails and never revalidates", async () => {
    const rpcHandler = vi.fn(() => ({
      data: null,
      error: { message: "denied" },
    }));
    const client = buildSupabaseMock({ hasPermission: true, rpcHandler });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await deleteOportunidadAction(701, 9);

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addBitacoraEntryAction
// ---------------------------------------------------------------------------
describe("addBitacoraEntryAction", () => {
  it("denies without crm.crear and never attempts the insert", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await addBitacoraEntryAction(701, { texto: "Nota" });

    expect(result.error).toBeTruthy();
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty texto before ever reaching Supabase", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await addBitacoraEntryAction(701, { texto: "   " });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("returns a generic error and never inserts when there is no session", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(null);

    const result = await addBitacoraEntryAction(701, { texto: "Nota" });

    expect(result.error).toBe(es.common.genericError);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("inserts with autor_id forced server-side from the session (never client-supplied) and revalidates", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await addBitacoraEntryAction(701, {
      texto: "Reunión inicial",
    });

    expect(client.from).toHaveBeenCalledWith("bitacora_cliente");
    expect(builder.insert).toHaveBeenCalledWith({
      cliente_id: 701,
      autor_id: SESSION.userId,
      texto: "Reunión inicial",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/bitacora");
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCompromisoAction
// ---------------------------------------------------------------------------
describe("createCompromisoAction", () => {
  it("denies without crm.crear and never attempts the insert", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: false,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await createCompromisoAction(701, {
      titulo: "Enviar propuesta",
    });

    expect(result.error).toBeTruthy();
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty titulo before ever reaching Supabase", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await createCompromisoAction(701, { titulo: "" });

    expect(result.error).toBe(es.common.requiredField);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("returns a generic error and never inserts when there is no session", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(null);

    const result = await createCompromisoAction(701, {
      titulo: "Enviar propuesta",
    });

    expect(result.error).toBe(es.common.genericError);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("inserts a tarea with origen='CRM' and responsable_id defaulted to the creating user, revalidates page+layout", async () => {
    const builder = insertOnly();
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await createCompromisoAction(701, {
      titulo: "Enviar propuesta",
      fechaLimite: "2026-08-15",
      prioridad: "alta",
    });

    expect(client.from).toHaveBeenCalledWith("tarea");
    expect(builder.insert).toHaveBeenCalledWith({
      titulo: "Enviar propuesta",
      cliente_id: 701,
      origen: "CRM",
      responsable_id: SESSION.userId,
      fecha_limite: "2026-08-15",
      prioridad: "alta",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701/compromisos");
    expect(revalidatePathMock).toHaveBeenCalledWith("/crm/701", "layout");
    expect(result.success).toBe(true);
  });

  it("surfaces a generic error when the insert itself fails and never revalidates", async () => {
    const builder = insertOnly({ error: { message: "denied" } });
    const client = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => builder,
    });
    mockedCreateClient.mockResolvedValue(client as never);
    mockedGetSessionContext.mockResolvedValue(SESSION);

    const result = await createCompromisoAction(701, {
      titulo: "Enviar propuesta",
    });

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
