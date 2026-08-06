import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getCatalogoOptions } from "@/lib/crm/catalogos";
import { es } from "@/messages/es";
import {
  createTareaAction,
  deleteTareaAction,
  updateTareaAction,
} from "@/lib/kanban/actions";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/crm/catalogos", () => ({
  getCatalogoOptions: vi.fn(),
  activeCatalogoOptions: (
    map: Map<string, { codigo: string; activo: boolean }[]>,
    tipo: string,
  ) => (map.get(tipo) ?? []).filter((option) => option.activo),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCatalogoOptions = vi.mocked(getCatalogoOptions);

/**
 * Same mocking shape `src/lib/crm/actions.test.ts` establishes: the action
 * re-checks `has_permission('kanban', accion)` via `rpc()` as its own pre-check
 * before ever touching `.from()`.
 */
function buildSupabaseMock(options: {
  hasPermission: boolean;
  fromHandler?: (table: string) => unknown;
}) {
  const rpc = vi.fn((name: string) => {
    if (name === "has_permission") {
      return Promise.resolve({ data: options.hasPermission, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  const from = vi.fn((table: string) => options.fromHandler?.(table) ?? {});
  return { rpc, from };
}

/**
 * The payload parameter is declared even though the stub ignores it: without it
 * `vi.fn`'s inferred call signature is zero-arg, so `mock.calls` types as an
 * empty tuple and `calls[0][0]` fails `tsc --noEmit` (which vitest itself never
 * runs — CI's static-checks job is what catches it). The "does not write
 * columna" test needs to read that argument.
 */
function insertOnly(result: { error?: unknown } = {}) {
  const insert = vi.fn((_payload: Record<string, unknown>) =>
    Promise.resolve({ error: result.error ?? null }),
  );
  return { insert };
}

/**
 * `.update(payload).eq("id", tareaId)` — the terminal `eq` resolves, so both the
 * payload and the row scoping are assertable. Same reason `insertOnly` declares
 * its ignored parameter: without it the inferred call signature is zero-arg and
 * `mock.calls[0][0]` fails `tsc --noEmit`.
 */
function updateOnly(result: { error?: unknown } = {}) {
  const eq = vi.fn((_column: string, _value: unknown) =>
    Promise.resolve({ error: result.error ?? null }),
  );
  const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }));
  return { update, eq };
}

/** Active `etiqueta_tarea` codes plus one DEACTIVATED, to drive both branches. */
function catalogoMap() {
  return new Map([
    [
      "etiqueta_tarea",
      [
        { codigo: "comercial", etiqueta: "Comercial", orden: 1, activo: true },
        { codigo: "retirada", etiqueta: "Retirada", orden: 2, activo: false },
      ],
    ],
  ]);
}

const VALID_CREATE = {
  titulo: "Preparar acta del comité",
  responsableId: "user-kanban-1",
  etiquetas: ["comercial"],
};

const VALID_UPDATE = {
  titulo: "Preparar acta del comité (v2)",
  responsableId: "user-kanban-2",
  descripcion: "Incluir los acuerdos de la última sesión.",
  fechaLimite: "2026-09-01",
  prioridad: "Alta",
  etiquetas: ["comercial"],
};

beforeEach(() => {
  mockedCreateClient.mockReset();
  mockedGetCatalogoOptions.mockReset();
  revalidatePathMock.mockReset();
  mockedGetCatalogoOptions.mockResolvedValue(catalogoMap());
});

describe("createTareaAction (spec KT2, PRD §5.2/§5.3)", () => {
  it("refuses without kanban.crear and never reaches the table", async () => {
    const supabase = buildSupabaseMock({ hasPermission: false });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createTareaAction(VALID_CREATE);

    expect(result.error).toBe(es.common.genericError);
    // The pre-check must short-circuit BEFORE any table access — the same
    // assertion PR #26 established for every CRM/admin action.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("gates on the kanban module, not crm", async () => {
    const modulos: string[] = [];
    const rpc = vi.fn((name: string, args?: unknown) => {
      if (name === "has_permission") {
        modulos.push((args as { modulo?: string } | undefined)?.modulo ?? "");
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockedCreateClient.mockResolvedValue({
      rpc,
      from: vi.fn(() => insertOnly()),
    } as never);

    await createTareaAction(VALID_CREATE);

    // RLS on `tarea` is origen-aware: an `origen='Kanban'` insert is gated on
    // has_permission('kanban','crear'), NOT crm (audit.sql:197-203). A
    // pre-check against the wrong module would diverge from the DB boundary
    // and either over- or under-permit relative to what Postgres will accept.
    expect(modulos).toContain("kanban");
    expect(modulos).not.toContain("crm");
  });

  it("inserts with origen='Kanban' so the origen-aware policy matches", async () => {
    const table = insertOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createTareaAction(VALID_CREATE);

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("tarea");
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Preparar acta del comité",
        origen: "Kanban",
        responsable_id: "user-kanban-1",
      }),
    );
  });

  it("does not write columna — a new card relies on the null-column fold", async () => {
    const table = insertOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await createTareaAction(VALID_CREATE);

    // `groupTareasByColumna` folds a null `columna` into the fallback (first)
    // column by design (D3, columnas.ts:95), so the card is visible
    // immediately without this write path having to know which column is
    // first — that ordering belongs to the catalog.
    const payload = table.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("columna");
  });

  it("rejects a blank titulo", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createTareaAction({ ...VALID_CREATE, titulo: "   " });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a missing responsable — Kanban never writes a borrador", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    // Spec KT1: `borrador_sin_responsable` (domain.sql:37) permits a null
    // responsable ONLY for estado='borrador', which Kanban never writes — so
    // responsable is required at this gate, unlike CRM's `compromisoSchema`.
    // PRD §5.3: "Ninguna tarea puede quedar sin responsable."
    const result = await createTareaAction({
      ...VALID_CREATE,
      responsableId: "",
    });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an etiqueta whose catalog code is deactivated", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    // Design D4: there is NO DB-level FK on array elements, so this app-layer
    // check is the ONLY enforcement — not merely a friendlier early gate. A mix
    // of one active and one retired code rejects the WHOLE write, so
    // deactivating a tag never silently strips it from an in-flight submission.
    const result = await createTareaAction({
      ...VALID_CREATE,
      etiquetas: ["comercial", "retirada"],
    });

    expect(result.error).toBe(es.kanban.errors.etiquetaInactiva);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("accepts an empty etiquetas array", async () => {
    const table = insertOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createTareaAction({ ...VALID_CREATE, etiquetas: [] });

    // PRD §5.2: titulo is the only field a user must supply, so no-tags has to
    // be a valid create rather than a validation error.
    expect(result.success).toBe(true);
    expect(table.insert).toHaveBeenCalled();
  });

  it("surfaces a write failure instead of reporting success", async () => {
    const table = insertOnly({ error: { message: "insert denied" } });
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createTareaAction(VALID_CREATE);

    expect(result.error).toBe(es.common.genericError);
    expect(result.success).toBeUndefined();
    // PRD §1.2 forbids a "guardado silencioso": a failed write must not
    // revalidate as though something changed.
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the board so the new card appears without a reload", async () => {
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => insertOnly(),
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await createTareaAction(VALID_CREATE);

    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban");
  });
});

/** Captures every `(modulo, accion)` pair the action pre-checks. */
function permissionSpy(allowed: boolean) {
  const asked: { modulo: string; accion: string }[] = [];
  const rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "has_permission") {
      const typed = args as { modulo?: string; accion?: string } | undefined;
      asked.push({ modulo: typed?.modulo ?? "", accion: typed?.accion ?? "" });
      return Promise.resolve({ data: allowed, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return { rpc, asked };
}

describe("updateTareaAction (spec KT1/KT2)", () => {
  it("refuses without kanban.editar and never reaches the table", async () => {
    const supabase = buildSupabaseMock({ hasPermission: false });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await updateTareaAction(7, VALID_UPDATE);

    expect(result.error).toBe(es.common.genericError);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("asks for editar, not crear", async () => {
    const { rpc, asked } = permissionSpy(true);
    mockedCreateClient.mockResolvedValue({
      rpc,
      from: vi.fn(() => updateOnly()),
    } as never);

    await updateTareaAction(7, VALID_UPDATE);

    expect(asked).toContainEqual({ modulo: "kanban", accion: "editar" });
    expect(asked.map((entry) => entry.accion)).not.toContain("crear");
  });

  it("scopes the write to the given tarea id", async () => {
    const table = updateOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await updateTareaAction(7, VALID_UPDATE);

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("tarea");
    expect(table.eq).toHaveBeenCalledWith("id", 7);
    expect(table.update).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Preparar acta del comité (v2)",
        responsable_id: "user-kanban-2",
        descripcion: "Incluir los acuerdos de la última sesión.",
        fecha_limite: "2026-09-01",
        prioridad: "Alta",
        etiquetas: ["comercial"],
      }),
    );
  });

  it("never writes estado, columna or origen", async () => {
    const table = updateOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await updateTareaAction(7, VALID_UPDATE);

    // Those three are reconciled ONLY by `moveTareaAction` (slice 5b), which
    // owns design D5's terminal-column/estado sync rule. An edit that also
    // moved a card would let the form silently contradict the board — and
    // `origen` is never Kanban's to rewrite at all (only the CRM-side promote
    // toggle flips 'CRM' <-> 'Ambos').
    const payload = table.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("estado");
    expect(payload).not.toHaveProperty("columna");
    expect(payload).not.toHaveProperty("origen");
  });

  it("clears an omitted optional field instead of leaving a stale value", async () => {
    const table = updateOnly();
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await updateTareaAction(7, {
      titulo: "Sólo el título",
      responsableId: "user-kanban-2",
      etiquetas: [],
    });

    // Unlike create (which omits the key so the column default applies), edit
    // is the user's whole intent for the row: an emptied field must be
    // written as null, or a cleared fecha/prioridad/descripción would silently
    // keep its old value.
    expect(table.update).toHaveBeenCalledWith(
      expect.objectContaining({
        descripcion: null,
        fecha_limite: null,
        prioridad: null,
        cliente_id: null,
        etiquetas: [],
      }),
    );
  });

  it("rejects a blank titulo", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await updateTareaAction(7, {
      ...VALID_UPDATE,
      titulo: "   ",
    });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects clearing the responsable — the requirement holds on edit too", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    // Spec KT1 applies to BOTH write paths: a Kanban row never legitimately
    // reaches responsable_id = null, because `borrador_sin_responsable`
    // (domain.sql:37) only exempts estado='borrador', which Kanban never writes.
    const result = await updateTareaAction(7, {
      ...VALID_UPDATE,
      responsableId: "",
    });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an etiqueta whose catalog code is deactivated", async () => {
    const supabase = buildSupabaseMock({ hasPermission: true });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await updateTareaAction(7, {
      ...VALID_UPDATE,
      etiquetas: ["comercial", "retirada"],
    });

    expect(result.error).toBe(es.kanban.errors.etiquetaInactiva);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a write failure instead of reporting success", async () => {
    const table = updateOnly({ error: { message: "update denied" } });
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => table,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await updateTareaAction(7, VALID_UPDATE);

    expect(result.error).toBe(es.common.genericError);
    expect(result.success).toBeUndefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the board", async () => {
    const supabase = buildSupabaseMock({
      hasPermission: true,
      fromHandler: () => updateOnly(),
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await updateTareaAction(7, VALID_UPDATE);

    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban");
  });
});

describe("deleteTareaAction (spec KT3)", () => {
  it("refuses without kanban.eliminar and never calls the RPC", async () => {
    const { rpc, asked } = permissionSpy(false);
    mockedCreateClient.mockResolvedValue({ rpc, from: vi.fn() } as never);

    const result = await deleteTareaAction(7);

    expect(result.error).toBe(es.common.genericError);
    expect(asked).toContainEqual({ modulo: "kanban", accion: "eliminar" });
    expect(rpc).not.toHaveBeenCalledWith(
      "soft_delete_tarea",
      expect.anything(),
    );
  });

  it("soft-deletes through the existing origen-aware RPC, never a table write", async () => {
    const { rpc } = permissionSpy(true);
    const from = vi.fn();
    mockedCreateClient.mockResolvedValue({ rpc, from } as never);

    const result = await deleteTareaAction(7);

    // KT3: `soft_delete_tarea` (audit.sql:312) already branches on origen, so
    // Kanban needs NO new RPC — and no DELETE grant exists on `tarea` for
    // anyone, which is why a direct table write is not an alternative here.
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("soft_delete_tarea", { p_id: 7 });
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces an RPC failure instead of reporting success", async () => {
    const rpc = vi.fn((name: string) => {
      if (name === "has_permission") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: "soft delete denied" },
      });
    });
    mockedCreateClient.mockResolvedValue({ rpc, from: vi.fn() } as never);

    const result = await deleteTareaAction(7);

    expect(result.error).toBe(es.common.genericError);
    expect(result.success).toBeUndefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the board", async () => {
    const { rpc } = permissionSpy(true);
    mockedCreateClient.mockResolvedValue({ rpc, from: vi.fn() } as never);

    await deleteTareaAction(7);

    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban");
  });
});
