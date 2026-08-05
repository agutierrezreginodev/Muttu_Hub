import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getCatalogoOptions } from "@/lib/crm/catalogos";
import { es } from "@/messages/es";
import { createTareaAction } from "@/lib/kanban/actions";

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
