import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getCatalogoOptions } from "@/lib/crm/catalogos";
import { es } from "@/messages/es";
import { getSessionContext } from "@/lib/session/get-session-context";
import {
  createComentarioAction,
  createTareaAction,
  deleteTareaAction,
  moveTareaAction,
  togglePromoteCompromisoAction,
  updateTareaAction,
} from "@/lib/kanban/actions";

const SESSION_USER_ID = "user-kanban-1";
vi.mock("@/lib/session/get-session-context", () => ({
  getSessionContext: vi.fn(),
}));

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
  vi.mocked(getSessionContext).mockResolvedValue({
    userId: SESSION_USER_ID,
    nombre: "Ana",
    email: "ana@muttu-hub.test",
    rolId: 1,
    rolNombre: "Administrador",
    permisos: {},
  } as never);
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

interface MoveRow {
  columna: string | null;
  estado: string;
  origen: string;
  responsable_id: string | null;
}

/**
 * Three tables, three chain shapes: `v_tarea` reads the current row,
 * `v_catalogo` answers "is this destination still active" (correction C5), and
 * `tarea` takes the patch. Modelled per-table rather than with one generic
 * chain, so a call landing on the WRONG table shows up as an undefined method
 * instead of quietly returning a plausible result.
 */
function buildMoveMock(options: {
  hasPermission?: boolean;
  row?: MoveRow | null;
  columnaActiva?: boolean;
  updateError?: unknown;
}) {
  const update = vi.fn((_payload: Record<string, unknown>) => ({
    eq: (_column: string, _value: unknown) =>
      Promise.resolve({ error: options.updateError ?? null }),
  }));

  const rpc = vi.fn((name: string) => {
    if (name === "has_permission") {
      return Promise.resolve({
        data: options.hasPermission ?? true,
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    if (table === "v_tarea") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: options.row === undefined ? DEFAULT_ROW : options.row,
            error: null,
          }),
      };
      return chain;
    }
    if (table === "v_catalogo") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              (options.columnaActiva ?? true) ? { codigo: "cumplido" } : null,
            error: null,
          }),
      };
      return chain;
    }
    return { update };
  });

  return { rpc, from, update, tables };
}

const DEFAULT_ROW: MoveRow = {
  columna: "en_revision",
  estado: "en_curso",
  origen: "Kanban",
  responsable_id: "user-kanban-1",
};

describe("moveTareaAction (design §6 — the single estado/columna sync point)", () => {
  it("refuses without kanban.editar and never reads the row", async () => {
    const supabase = buildMoveMock({ hasPermission: false });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    expect(result.error).toBe(es.common.genericError);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a move into a DEACTIVATED column (correction C5)", async () => {
    const supabase = buildMoveMock({ columnaActiva: false });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    // The composite FK proves the code EXISTS in `catalogo`; `activo` is not
    // part of the PK, so Postgres accepts a write into an already-deactivated
    // column. This app-layer guard is the only thing that does not.
    expect(result.error).toBe(es.kanban.errors.columnaInactiva);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects a terminal move on a responsable-less row instead of raising 23514 (correction C4)", async () => {
    const supabase = buildMoveMock({
      row: {
        columna: "por_hacer",
        estado: "borrador",
        origen: "Ambos",
        responsable_id: null,
      },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    // Reachable in production: a CRM compromiso created as estado='borrador'
    // with no responsable, promoted to origen='Ambos', then dropped into
    // "Completada" — `borrador_sin_responsable` (domain.sql:37) would raise a
    // raw 23514 surfaced as a meaningless generic error.
    expect(result.error).toBe(es.kanban.errors.responsableRequeridoParaMover);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("allows a responsable-less row to move between non-terminal columns", async () => {
    const supabase = buildMoveMock({
      row: {
        columna: "por_hacer",
        estado: "borrador",
        origen: "Ambos",
        responsable_id: null,
      },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "en_revision",
    });

    // The C4 guard must key on "this patch would SET an estado", not on "the
    // row has no responsable" — otherwise a promoted borrador could never be
    // moved on the board at all.
    expect(result.success).toBe(true);
    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ columna: "en_revision" }),
    );
    const payload = supabase.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("estado");
  });

  it("writes columna AND the synced estado entering a terminal column", async () => {
    const supabase = buildMoveMock({});
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    expect(result.success).toBe(true);
    expect(supabase.update).toHaveBeenCalledWith({
      columna: "cumplido",
      estado: "cumplido",
    });
  });

  it("writes only columna when the destination owns no estado", async () => {
    const supabase = buildMoveMock({
      row: {
        columna: "por_hacer",
        estado: "pendiente",
        origen: "Kanban",
        responsable_id: "user-kanban-1",
      },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await moveTareaAction({ tareaId: 7, columnaDestino: "en_revision" });

    expect(supabase.update).toHaveBeenCalledWith({ columna: "en_revision" });
  });

  it("never writes null back into columna, so D3's null state decays", async () => {
    const supabase = buildMoveMock({
      row: {
        columna: null,
        estado: "pendiente",
        origen: "Kanban",
        responsable_id: "user-kanban-1",
      },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await moveTareaAction({ tareaId: 7, columnaDestino: "en_revision" });

    const payload = supabase.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload.columna).toBe("en_revision");
  });

  it("returns a generic error for a row RLS hid, without confirming it exists", async () => {
    const supabase = buildMoveMock({ row: null });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    expect(result.error).toBe(es.common.genericError);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects a blank columnaDestino before touching the database", async () => {
    const supabase = buildMoveMock({});
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({ tareaId: 7, columnaDestino: "  " });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a write failure instead of reporting success", async () => {
    const supabase = buildMoveMock({ updateError: { message: "denied" } });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await moveTareaAction({
      tareaId: 7,
      columnaDestino: "cumplido",
    });

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the layout scope too, or the bell keeps a completed task", async () => {
    const supabase = buildMoveMock({});
    mockedCreateClient.mockResolvedValue(supabase as never);

    await moveTareaAction({ tareaId: 7, columnaDestino: "cumplido" });

    // The bell count lives in (app)/layout.tsx (slice 10). Without the layout
    // scope a completed task keeps showing there until the next full
    // navigation — design §6 step 7 calls for both revalidations.
    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban");
    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban", "layout");
  });
});

/**
 * A `rpc('has_permission')` spy that answers per module, so the origen-aware
 * branch can be driven precisely (design D7).
 */
function permissionByModulo(allowed: Record<string, boolean>) {
  const asked: { modulo: string; accion: string }[] = [];
  const rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "has_permission") {
      const typed = args as { modulo?: string; accion?: string } | undefined;
      const modulo = typed?.modulo ?? "";
      asked.push({ modulo, accion: typed?.accion ?? "" });
      return Promise.resolve({ data: allowed[modulo] ?? false, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return { rpc, asked };
}

function buildComentarioMock(options: {
  allowed: Record<string, boolean>;
  origen?: string | null;
  insertError?: unknown;
}) {
  const insert = vi.fn((_payload: Record<string, unknown>) =>
    Promise.resolve({ error: options.insertError ?? null }),
  );
  const { rpc, asked } = permissionByModulo(options.allowed);

  const from = vi.fn((table: string) => {
    if (table === "v_tarea") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              options.origen === null
                ? null
                : { id: 7, origen: options.origen ?? "Kanban" },
            error: null,
          }),
      };
      return chain;
    }
    return { insert };
  });

  return { rpc, from, insert, asked };
}

describe("createComentarioAction (spec KM1, design D7/D8)", () => {
  it("inserts the comment with the caller as autor", async () => {
    const supabase = buildComentarioMock({ allowed: { kanban: true } });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createComentarioAction(7, {
      texto: "Actualicé el alcance con el cliente.",
    });

    expect(result.success).toBe(true);
    // `tarea_comentario_insert` pins `autor_id = auth.uid()`, so the action must
    // send the session's own id — a client-supplied autor is rejected by RLS.
    expect(supabase.insert).toHaveBeenCalledWith({
      tarea_id: 7,
      autor_id: SESSION_USER_ID,
      texto: "Actualicé el alcance con el cliente.",
    });
  });

  it("accepts a crm.crear holder commenting on a CRM-origen tarea", async () => {
    const supabase = buildComentarioMock({
      allowed: { crm: true, kanban: false },
      origen: "CRM",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createComentarioAction(7, { texto: "Nota CRM" });

    // D7: `tarea_origen_permite` grants on the row's OWN origen module. A
    // kanban-only pre-check would refuse a write Postgres would have accepted.
    expect(result.success).toBe(true);
  });

  it("accepts either module for an 'Ambos' tarea", async () => {
    const supabase = buildComentarioMock({
      allowed: { crm: false, kanban: true },
      origen: "Ambos",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    expect((await createComentarioAction(7, { texto: "Nota" })).success).toBe(
      true,
    );
  });

  it("refuses when the row's origen module denies crear", async () => {
    const supabase = buildComentarioMock({
      allowed: { crm: true, kanban: false },
      origen: "Kanban",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createComentarioAction(7, { texto: "Nota" });

    // Holding crm.crear must not let anyone comment on a Kanban-origen row.
    expect(result.error).toBe(es.common.genericError);
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("returns the generic error for a tarea RLS hid", async () => {
    const supabase = buildComentarioMock({
      allowed: { kanban: true },
      origen: null,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createComentarioAction(7, { texto: "Nota" });

    expect(result.error).toBe(es.common.genericError);
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("rejects a blank comment before touching the database", async () => {
    const supabase = buildComentarioMock({ allowed: { kanban: true } });
    mockedCreateClient.mockResolvedValue(supabase as never);

    // `texto text not null check (length(btrim(texto)) > 0)` would raise 23514;
    // this is the friendlier gate on top of it.
    const result = await createComentarioAction(7, { texto: "   " });

    expect(result.error).toBe(es.common.requiredField);
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it("surfaces an insert failure instead of reporting success", async () => {
    const supabase = buildComentarioMock({
      allowed: { kanban: true },
      insertError: { message: "denied" },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await createComentarioAction(7, { texto: "Nota" });

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates the tarea detail route", async () => {
    const supabase = buildComentarioMock({ allowed: { kanban: true } });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await createComentarioAction(7, { texto: "Nota" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban/7");
  });
});

function buildPromoteMock(options: {
  allowed: Record<string, boolean>;
  origen?: string | null;
  clienteId?: number | null;
  updateError?: unknown;
}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    return {
      eq: vi.fn(() => Promise.resolve({ error: options.updateError ?? null })),
    };
  });
  const { rpc, asked } = permissionByModulo(options.allowed);

  const from = vi.fn((table: string) => {
    if (table === "v_tarea") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              options.origen === null
                ? null
                : {
                    id: 7,
                    origen: options.origen ?? "CRM",
                    cliente_id:
                      options.clienteId === undefined ? 42 : options.clienteId,
                  },
            error: null,
          }),
      };
      return chain;
    }
    return { update };
  });

  return { rpc, from, asked, update, updatePayloads };
}

/**
 * Slice 9 (spec KP2, design D7). `origen` is the only column this action may
 * touch, and the `'CRM' ⇄ 'Ambos'` pair is the only transition it may make.
 */
describe("togglePromoteCompromisoAction (slice 9)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("gates on crm.editar, not on kanban — the row is CRM-origen", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: false, kanban: true },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result.error).toBe(es.common.genericError);
    // `tarea_update`'s policy is origen-aware, so a `kanban` pre-check here
    // would pass while Postgres refused the write — a gate that disagrees
    // with the real boundary is worse than no gate.
    expect(supabase.asked).toContainEqual({
      modulo: "crm",
      accion: "editar",
    });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("promotes a CRM compromiso to Ambos", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "CRM",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result).toEqual({ success: true });
    expect(supabase.updatePayloads).toEqual([{ origen: "Ambos" }]);
  });

  it("demotes an Ambos compromiso back to CRM", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "Ambos",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await togglePromoteCompromisoAction(7, false);

    expect(supabase.updatePayloads).toEqual([{ origen: "CRM" }]);
  });

  it("writes ONLY origen — never estado, columna or anything else", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "CRM",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await togglePromoteCompromisoAction(7, true);

    expect(Object.keys(supabase.updatePayloads[0] ?? {})).toEqual(["origen"]);
  });

  it("refuses a Kanban-origen row instead of fabricating a CRM side for it", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "Kanban",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result.error).toBe(es.crm.compromisos.promoteOrigenInvalido);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("treats an already-correct origen as success without writing", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "Ambos",
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result).toEqual({ success: true });
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("refuses a row it cannot see", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: null,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result.error).toBe(es.common.genericError);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("revalidates the board as well as the compromisos tab", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "CRM",
      clienteId: 42,
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    await togglePromoteCompromisoAction(7, true);

    // Revalidating only the tab would leave the board missing the card the
    // user just put on it.
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/crm/42/compromisos",
      "page",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/kanban");
  });

  it("surfaces a write failure rather than reporting success", async () => {
    const supabase = buildPromoteMock({
      allowed: { crm: true },
      origen: "CRM",
      updateError: { message: "denied" },
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await togglePromoteCompromisoAction(7, true);

    expect(result.error).toBe(es.common.genericError);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
