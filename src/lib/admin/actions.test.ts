import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrigin } from "@/lib/auth/actions";
import { emptyPermisosGrid } from "@/lib/permissions";
import {
  inviteUserAction,
  updateUserAction,
  deactivateUserAction,
  reactivateUserAction,
  createRoleAction,
  updateRoleAction,
  toggleRoleActivoAction,
  createCatalogoAction,
  updateCatalogoAction,
  deactivateCatalogoAction,
} from "@/lib/admin/actions";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/actions", () => ({
  getOrigin: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient);
const mockedGetOrigin = vi.mocked(getOrigin);

/**
 * Every admin action re-checks has_permission() itself via the caller's own
 * RLS-gated client before doing anything privileged (assertAdminPermission,
 * src/lib/admin/actions.ts:33). This is the ONLY gate standing between a
 * caller and the service-role writes (invite/deactivate/reactivate) that
 * follow, since service_role bypasses RLS entirely. Each `deny...` test
 * below pins that exact boundary: permission false -> zero writes anywhere.
 */
function createRegularClient(options: {
  allowed?: boolean;
  rpcError?: unknown;
  writeError?: unknown;
  rolLookup?: { data: unknown; error: unknown };
}) {
  const eqSingle = vi.fn(() =>
    Promise.resolve(options.rolLookup ?? { data: { id: 1 }, error: null }),
  );
  const selectBuilder = {
    eq: vi.fn(() => ({ maybeSingle: vi.fn(() => eqSingle()) })),
  };
  // `.update(...).eq(...)` is used with either one `.eq()` (usuario/rol) or
  // two chained `.eq()` calls (catalogo's tipo+codigo natural key) — this
  // chain supports both: `eq` always returns itself so a second `.eq()`
  // call is valid, and awaiting the chain at any point resolves the write
  // result.
  const updateBuilder: { eq: ReturnType<typeof vi.fn> } & PromiseLike<{
    error: unknown;
  }> = {
    eq: vi.fn(() => updateBuilder),
    then: (resolve, reject) =>
      Promise.resolve({ error: options.writeError ?? null }).then(
        resolve,
        reject,
      ),
  } as { eq: ReturnType<typeof vi.fn> } & PromiseLike<{ error: unknown }>;
  const insert = vi.fn(() =>
    Promise.resolve({ error: options.writeError ?? null }),
  );
  const rpc = vi.fn(() =>
    Promise.resolve({
      data: options.allowed ?? true,
      error: options.rpcError ?? null,
    }),
  );
  const from = vi.fn(() => ({
    select: vi.fn(() => selectBuilder),
    update: vi.fn(() => updateBuilder),
    insert,
  }));
  return { rpc, from, insert, updateBuilder, selectBuilder };
}

beforeEach(() => {
  mockedCreateClient.mockReset();
  mockedCreateServiceRoleClient.mockReset();
  mockedGetOrigin.mockReset();
  revalidatePathMock.mockReset();
});

describe("inviteUserAction (spec U8)", () => {
  function createService(options: {
    rolLookup?: { data: unknown; error: unknown };
    inviteResult?: { data: unknown; error: unknown };
    insertUsuarioError?: unknown;
    insertRegistroError?: unknown;
  }) {
    const selectBuilder = {
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() =>
          Promise.resolve(
            options.rolLookup ?? { data: { id: 7 }, error: null },
          ),
        ),
      })),
    };
    const insertUsuario = vi.fn(() =>
      Promise.resolve({ error: options.insertUsuarioError ?? null }),
    );
    const insertRegistro = vi.fn(() =>
      Promise.resolve({ error: options.insertRegistroError ?? null }),
    );
    const inviteUserByEmail = vi.fn(() =>
      Promise.resolve(
        options.inviteResult ?? {
          data: { user: { id: "user-1" } },
          error: null,
        },
      ),
    );
    const from = vi.fn((table: string) => {
      if (table === "rol") return { select: vi.fn(() => selectBuilder) };
      if (table === "usuario") return { insert: insertUsuario };
      if (table === "registro_acceso") return { insert: insertRegistro };
      throw new Error(`unexpected table ${table}`);
    });
    return {
      from,
      insertUsuario,
      insertRegistro,
      inviteUserByEmail,
      auth: { admin: { inviteUserByEmail } },
    };
  }

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    return fd;
  }

  it("denies without admin.crear and performs no write at all", async () => {
    const regular = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "7" }),
    );

    expect(result.error).toBeTruthy();
    expect(regular.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "crear",
    });
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(service.inviteUserByEmail).not.toHaveBeenCalled();
    expect(service.insertUsuario).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before any Supabase call", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "not-an-email", rolId: "7" }),
    );

    expect(result.error).toBeTruthy();
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns a generic error and invites nobody when rolId does not exist", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({
      rolLookup: { data: null, error: null },
    });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "999" }),
    );

    expect(result.error).toBeTruthy();
    expect(service.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("returns a generic error and inserts nothing when inviteUserByEmail fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({
      inviteResult: { data: { user: null }, error: { message: "boom" } },
    });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );
    mockedGetOrigin.mockResolvedValue("https://app.example.com");

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "7" }),
    );

    expect(result.error).toBeTruthy();
    expect(service.insertUsuario).not.toHaveBeenCalled();
  });

  it("invites with redirectTo built from getOrigin, inserts usuario + registro_acceso, and revalidates on success", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );
    mockedGetOrigin.mockResolvedValue("https://app.example.com");

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "7" }),
    );

    expect(service.inviteUserByEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo:
        "https://app.example.com/auth/callback?next=/actualizar-clave",
    });
    expect(service.insertUsuario).toHaveBeenCalledWith({
      id: "user-1",
      nombre: "Ana",
      email: "ana@example.com",
      rol_id: 7,
    });
    expect(service.insertRegistro).toHaveBeenCalledWith({
      usuario_id: "user-1",
      evento: "invitacion",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/usuarios");
    expect(result.success).toBe(true);
  });

  it("returns a generic error (and never revalidates) when the usuario insert itself fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({ insertUsuarioError: { message: "23505" } });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );
    mockedGetOrigin.mockResolvedValue("https://app.example.com");

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "7" }),
    );

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("still reports success when only the registro_acceso insert fails (best-effort audit log)", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({
      insertRegistroError: { message: "boom" },
    });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );
    mockedGetOrigin.mockResolvedValue("https://app.example.com");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await inviteUserAction(
      {},
      formData({ nombre: "Ana", email: "ana@example.com", rolId: "7" }),
    );

    expect(result.success).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/usuarios");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("updateUserAction (task 4.5)", () => {
  it("denies without admin.editar and performs no update", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateUserAction(
      "11111111-1111-4111-8111-111111111111",
      1,
      null,
    );

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid usuarioId before touching Supabase", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateUserAction("not-a-uuid", 1, null);

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("normalizes a null override to a null column write (empty override == no override)", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateUserAction(
      "11111111-1111-4111-8111-111111111111",
      2,
      null,
    );

    expect(client.from).toHaveBeenCalledWith("usuario");
    expect(client.updateBuilder.eq).toHaveBeenCalledWith(
      "id",
      "11111111-1111-4111-8111-111111111111",
    );
    const [updatePayload] = (client.from as ReturnType<typeof vi.fn>).mock
      .results[0].value.update.mock.calls[0];
    expect(updatePayload).toEqual({ rol_id: 2, permisos_override: null });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/usuarios");
    expect(result.success).toBe(true);
  });

  it("writes a non-empty override verbatim", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const override = { admin: { editar: true } };

    await updateUserAction("11111111-1111-4111-8111-111111111111", 3, override);

    const [updatePayload] = (client.from as ReturnType<typeof vi.fn>).mock
      .results[0].value.update.mock.calls[0];
    expect(updatePayload).toEqual({
      rol_id: 3,
      permisos_override: override,
    });
  });

  it("surfaces a generic error and never revalidates when the update fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "permission denied" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateUserAction(
      "11111111-1111-4111-8111-111111111111",
      2,
      null,
    );

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deactivateUserAction / reactivateUserAction (spec U6)", () => {
  function createService(options: {
    banError?: unknown;
    updateError?: unknown;
    registroError?: unknown;
  }) {
    const updateUserById = vi.fn(() =>
      Promise.resolve({ error: options.banError ?? null }),
    );
    const updateEq = vi.fn(() =>
      Promise.resolve({ error: options.updateError ?? null }),
    );
    const updateBuilder = { eq: vi.fn(() => updateEq()) };
    const insertRegistro = vi.fn(() =>
      Promise.resolve({ error: options.registroError ?? null }),
    );
    const from = vi.fn((table: string) => {
      if (table === "usuario") return { update: vi.fn(() => updateBuilder) };
      if (table === "registro_acceso") return { insert: insertRegistro };
      throw new Error(`unexpected table ${table}`);
    });
    return {
      from,
      updateBuilder,
      insertRegistro,
      auth: { admin: { updateUserById } },
    };
  }

  it("deactivate: denies without admin.editar and calls neither the ban API nor any write", async () => {
    const regular = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await deactivateUserAction("user-1");

    expect(result.error).toBeTruthy();
    expect(regular.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(service.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(service.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deactivate: bans ~forever, flips activo=false, logs 'desactivacion', and revalidates", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await deactivateUserAction("user-1");

    expect(service.auth.admin.updateUserById).toHaveBeenCalledWith("user-1", {
      ban_duration: "876000h",
    });
    expect(service.from).toHaveBeenCalledWith("usuario");
    expect(service.updateBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(service.insertRegistro).toHaveBeenCalledWith({
      usuario_id: "user-1",
      evento: "desactivacion",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/usuarios");
    expect(result.success).toBe(true);
  });

  it("deactivate: stops immediately (no usuario write) when the ban call itself fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({ banError: { message: "boom" } });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await deactivateUserAction("user-1");

    expect(result.error).toBeTruthy();
    expect(service.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deactivate: reports an error without revalidating when the usuario row update fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({ updateError: { message: "boom" } });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await deactivateUserAction("user-1");

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deactivate: still reports success when only the registro_acceso insert fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({ registroError: { message: "boom" } });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await deactivateUserAction("user-1");

    expect(result.success).toBe(true);
    consoleErrorSpy.mockRestore();
  });

  it("reactivate: denies without admin.editar and calls neither the unban API nor any write", async () => {
    const regular = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await reactivateUserAction("user-1");

    expect(result.error).toBeTruthy();
    expect(regular.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(service.from).not.toHaveBeenCalled();
  });

  it("reactivate: lifts the ban, flips activo=true, logs 'reactivacion', and revalidates", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({});
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await reactivateUserAction("user-1");

    expect(service.auth.admin.updateUserById).toHaveBeenCalledWith("user-1", {
      ban_duration: "none",
    });
    expect(service.updateBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(service.insertRegistro).toHaveBeenCalledWith({
      usuario_id: "user-1",
      evento: "reactivacion",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/usuarios");
    expect(result.success).toBe(true);
  });

  it("reactivate: stops immediately (no usuario write) when the unban call itself fails", async () => {
    const regular = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      regular as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    const service = createService({ banError: { message: "boom" } });
    mockedCreateServiceRoleClient.mockReturnValue(
      service as unknown as ReturnType<typeof createServiceRoleClient>,
    );

    const result = await reactivateUserAction("user-1");

    expect(result.error).toBeTruthy();
    expect(service.from).not.toHaveBeenCalled();
  });
});

describe("createRoleAction / updateRoleAction (spec U5)", () => {
  const grid = emptyPermisosGrid();

  it("create: denies without admin.crear and inserts nothing", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createRoleAction({
      nombre: "Supervisor",
      descripcion: "",
      permisos: grid,
    });

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "crear",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("create: rejects a malformed permisos grid before touching Supabase", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createRoleAction({
      nombre: "Supervisor",
      descripcion: "",
      permisos: { crm: "not-a-grid" },
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("create: inserts nombre/descripcion/permisos and revalidates /admin/roles", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createRoleAction({
      nombre: "Supervisor",
      descripcion: "Rol de supervisor",
      permisos: grid,
    });

    expect(client.from).toHaveBeenCalledWith("rol");
    expect(client.insert).toHaveBeenCalledWith({
      nombre: "Supervisor",
      descripcion: "Rol de supervisor",
      permisos: grid,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/roles");
    expect(result.success).toBe(true);
  });

  it("create: surfaces a generic error and never revalidates when the insert fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "boom" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createRoleAction({
      nombre: "Supervisor",
      descripcion: "",
      permisos: grid,
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("update: denies without admin.editar and updates nothing", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateRoleAction({
      rolId: 5,
      nombre: "Supervisor",
      descripcion: "",
      permisos: grid,
    });

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("update: rejects a malformed permisos grid before touching Supabase", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateRoleAction({
      rolId: 5,
      nombre: "Supervisor",
      descripcion: "",
      permisos: {},
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("update: writes nombre/descripcion/permisos scoped to rolId and revalidates", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateRoleAction({
      rolId: 5,
      nombre: "Supervisor",
      descripcion: "Actualizado",
      permisos: grid,
    });

    expect(client.from).toHaveBeenCalledWith("rol");
    expect(client.updateBuilder.eq).toHaveBeenCalledWith("id", 5);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/roles");
    expect(result.success).toBe(true);
  });

  it("update: surfaces a generic error and never revalidates when the update fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "boom" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateRoleAction({
      rolId: 5,
      nombre: "Supervisor",
      descripcion: "",
      permisos: grid,
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("toggleRoleActivoAction (soft-delete a role, never hard-delete)", () => {
  it("denies without admin.editar and updates nothing", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await toggleRoleActivoAction(5, false);

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deactivates a role (activo=false) scoped to rolId and revalidates", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await toggleRoleActivoAction(5, false);

    expect(client.from).toHaveBeenCalledWith("rol");
    expect(client.updateBuilder.eq).toHaveBeenCalledWith("id", 5);
    const [updatePayload] = (client.from as ReturnType<typeof vi.fn>).mock
      .results[0].value.update.mock.calls[0];
    expect(updatePayload).toEqual({ activo: false });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/roles");
    expect(result.success).toBe(true);
  });

  it("reactivates a role (activo=true) — the reverse branch", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await toggleRoleActivoAction(5, true);

    const [updatePayload] = (client.from as ReturnType<typeof vi.fn>).mock
      .results[0].value.update.mock.calls[0];
    expect(updatePayload).toEqual({ activo: true });
  });

  it("surfaces a generic error and never revalidates when the update fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "boom" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await toggleRoleActivoAction(5, false);

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("createCatalogoAction / updateCatalogoAction (spec CAT4/CAT1)", () => {
  it("create: denies without admin.crear and inserts nothing", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createCatalogoAction({
      tipo: "estado_cliente",
      codigo: "activo",
      etiqueta: "Activo",
      orden: 1,
    });

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "crear",
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("create: rejects a tipo that is not snake_case before touching Supabase", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createCatalogoAction({
      tipo: "Estado Cliente",
      codigo: "activo",
      etiqueta: "Activo",
      orden: 1,
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("create: inserts tipo/codigo/etiqueta/orden and revalidates /admin/catalogos", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createCatalogoAction({
      tipo: "estado_cliente",
      codigo: "activo",
      etiqueta: "Activo",
      orden: 1,
    });

    expect(client.from).toHaveBeenCalledWith("catalogo");
    expect(client.insert).toHaveBeenCalledWith({
      tipo: "estado_cliente",
      codigo: "activo",
      etiqueta: "Activo",
      orden: 1,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogos");
    expect(result.success).toBe(true);
  });

  it("create: surfaces a generic error and never revalidates when the insert fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "boom" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await createCatalogoAction({
      tipo: "estado_cliente",
      codigo: "activo",
      etiqueta: "Activo",
      orden: 1,
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("update: denies without admin.editar and updates nothing", async () => {
    const client = createRegularClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateCatalogoAction("estado_cliente", "activo", {
      etiqueta: "Activo",
      orden: 2,
    });

    expect(result.error).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "editar",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("update: rejects an empty etiqueta before touching Supabase", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateCatalogoAction("estado_cliente", "activo", {
      etiqueta: "",
      orden: 2,
    });

    expect(result.error).toBeTruthy();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("update: writes only etiqueta/orden, scoped to the (tipo, codigo) natural key, and revalidates", async () => {
    const client = createRegularClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateCatalogoAction("estado_cliente", "activo", {
      etiqueta: "Activo (revisado)",
      orden: 2,
    });

    expect(client.from).toHaveBeenCalledWith("catalogo");
    const [updatePayload] = (client.from as ReturnType<typeof vi.fn>).mock
      .results[0].value.update.mock.calls[0];
    expect(updatePayload).toEqual({ etiqueta: "Activo (revisado)", orden: 2 });
    expect(client.updateBuilder.eq).toHaveBeenCalledWith(
      "tipo",
      "estado_cliente",
    );
    expect(client.updateBuilder.eq).toHaveBeenCalledWith("codigo", "activo");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogos");
    expect(result.success).toBe(true);
  });

  it("update: surfaces a generic error and never revalidates when the update fails", async () => {
    const client = createRegularClient({
      allowed: true,
      writeError: { message: "boom" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await updateCatalogoAction("estado_cliente", "activo", {
      etiqueta: "Activo",
      orden: 2,
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deactivateCatalogoAction (spec CAT3/CAT5, soft_delete_catalogo RPC only)", () => {
  function createRpcOnlyClient(options: {
    allowed?: boolean;
    rpcError?: unknown;
  }) {
    const permissionRpc = vi.fn().mockResolvedValueOnce({
      data: options.allowed ?? true,
      error: null,
    });
    const soft_delete = vi.fn().mockResolvedValueOnce({
      data: null,
      error: options.rpcError ?? null,
    });
    const rpc = vi.fn((fn: string, args: unknown) => {
      if (fn === "has_permission") return permissionRpc(fn, args);
      if (fn === "soft_delete_catalogo") return soft_delete(fn, args);
      throw new Error(`unexpected rpc ${fn}`);
    });
    return { rpc, permissionRpc, soft_delete };
  }

  it("denies without admin.eliminar and never calls soft_delete_catalogo", async () => {
    const client = createRpcOnlyClient({ allowed: false });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deactivateCatalogoAction("estado_cliente", "activo");

    expect(result.error).toBeTruthy();
    expect(client.permissionRpc).toHaveBeenCalledWith("has_permission", {
      modulo: "admin",
      accion: "eliminar",
    });
    expect(client.soft_delete).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("calls soft_delete_catalogo with p_tipo/p_codigo and revalidates on success", async () => {
    const client = createRpcOnlyClient({ allowed: true });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deactivateCatalogoAction("estado_cliente", "activo");

    expect(client.soft_delete).toHaveBeenCalledWith("soft_delete_catalogo", {
      p_tipo: "estado_cliente",
      p_codigo: "activo",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/catalogos");
    expect(result.success).toBe(true);
  });

  it("maps a 23503 referential violation to the specific 'in use' message (CAT5 guard)", async () => {
    const client = createRpcOnlyClient({
      allowed: true,
      rpcError: { code: "23503", message: "foreign key violation" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deactivateCatalogoAction("estado_cliente", "activo");

    expect(result.error).toBe(
      "No se puede desactivar: código en uso por un cliente o tarea existente.",
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("falls back to the generic error for any other RPC failure", async () => {
    const client = createRpcOnlyClient({
      allowed: true,
      rpcError: { code: "42501", message: "permission denied" },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const result = await deactivateCatalogoAction("estado_cliente", "activo");

    expect(result.error).toBe("Ocurrió un error. Intentá de nuevo.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
