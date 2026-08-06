import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { es } from "@/messages/es";
import { setResumenDiarioAction } from "@/lib/notificaciones/preferencias/actions";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

const USER_ID = "5c7e14df-296e-4b18-8a19-b69274da647f";

interface WriteResult {
  data?: { usuario_id: string }[];
  error?: { code?: string } | null;
}

/**
 * `update` results are QUEUED and consumed in order, because the 23505 branch
 * calls `update` twice and the two calls must be able to disagree.
 */
function buildSupabaseMock(options: {
  userId?: string | null;
  updateResults?: WriteResult[];
  insertResult?: { error?: { code?: string } | null };
}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const insertPayloads: Record<string, unknown>[] = [];
  const eqArgs: [string, string][] = [];
  const queue = [...(options.updateResults ?? [{ data: [], error: null }])];

  const update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    const result = queue.shift() ?? { data: [], error: null };
    return {
      eq: vi.fn((column: string, value: string) => {
        eqArgs.push([column, value]);
        return {
          select: vi.fn(() =>
            Promise.resolve({
              data: result.data ?? [],
              error: result.error ?? null,
            }),
          ),
        };
      }),
    };
  });

  const insert = vi.fn((payload: Record<string, unknown>) => {
    insertPayloads.push(payload);
    return Promise.resolve({ error: options.insertResult?.error ?? null });
  });

  const from = vi.fn(() => ({ update, insert }));
  const getUser = vi.fn(() =>
    Promise.resolve({
      data: {
        user:
          options.userId === null ? null : { id: options.userId ?? USER_ID },
      },
    }),
  );

  return {
    client: { auth: { getUser }, from },
    from,
    update,
    insert,
    updatePayloads,
    insertPayloads,
    eqArgs,
  };
}

function useMock(client: unknown) {
  mockedCreateClient.mockResolvedValue(
    client as Awaited<ReturnType<typeof createClient>>,
  );
}

/**
 * Slice 13, writing half.
 *
 * The shape under test is NOT an upsert, and that is the whole point.
 * `notificacion_preferencia` grants `authenticated` only a COLUMN-level
 * `update (resumen_diario_email)` and no table-level UPDATE
 * (20260730193725_notificacion_preferencia_digest.sql). PostgREST's upsert
 * emits `INSERT ... ON CONFLICT DO UPDATE`, whose privileges Postgres checks
 * at PLAN time — so `.upsert()` returns 403/42501 on this table ALWAYS, even
 * on the very first call when no row exists and the INSERT branch is the one
 * actually taken. Verified against the running REST API, not inferred.
 *
 * So the action is update-first / insert-fallback, and the fallback has to
 * survive the race where the row appears between the two.
 */
describe("setResumenDiarioAction (slice 13)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
    revalidatePathMock.mockReset();
  });

  it("updates in place when the user already has a row, and never inserts", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ data: [{ usuario_id: USER_ID }] }],
    });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: false }),
    ).resolves.toEqual({ success: true });

    expect(mock.updatePayloads).toEqual([{ resumen_diario_email: false }]);
    expect(mock.eqArgs).toEqual([["usuario_id", USER_ID]]);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("never sends usuario_id in the UPDATE payload — the grant excludes that column", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ data: [{ usuario_id: USER_ID }] }],
    });
    useMock(mock.client);

    await setResumenDiarioAction({ resumenDiarioEmail: true });

    expect(mock.updatePayloads[0]).not.toHaveProperty("usuario_id");
    expect(mock.updatePayloads[0]).not.toHaveProperty("updated_at");
  });

  it("inserts the row when the UPDATE matched nothing (no backfill exists)", async () => {
    const mock = buildSupabaseMock({ updateResults: [{ data: [] }] });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: false }),
    ).resolves.toEqual({ success: true });

    expect(mock.insertPayloads).toEqual([
      { usuario_id: USER_ID, resumen_diario_email: false },
    ]);
  });

  it("retries the update when the insert loses the race (23505)", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ data: [] }, { data: [{ usuario_id: USER_ID }] }],
      insertResult: { error: { code: "23505" } },
    });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: false }),
    ).resolves.toEqual({ success: true });

    expect(mock.update).toHaveBeenCalledTimes(2);
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it("reports a generic error when the insert fails for any other reason", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ data: [] }],
      insertResult: { error: { code: "42501" } },
    });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: false }),
    ).resolves.toEqual({ error: es.common.genericError });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a generic error when the update itself fails", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ error: { code: "42501" } }],
    });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: true }),
    ).resolves.toEqual({ error: es.common.genericError });
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("refuses to write without a session, and never reaches the table", async () => {
    const mock = buildSupabaseMock({ userId: null });
    useMock(mock.client);

    await expect(
      setResumenDiarioAction({ resumenDiarioEmail: false }),
    ).resolves.toEqual({ error: es.common.genericError });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("revalidates the preferences page after a successful write", async () => {
    const mock = buildSupabaseMock({
      updateResults: [{ data: [{ usuario_id: USER_ID }] }],
    });
    useMock(mock.client);

    await setResumenDiarioAction({ resumenDiarioEmail: false });

    expect(revalidatePathMock).toHaveBeenCalledWith("/preferencias");
  });
});
