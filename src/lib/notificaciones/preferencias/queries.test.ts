import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  RESUMEN_DIARIO_POR_DEFECTO,
  getResumenDiarioPreferencia,
} from "@/lib/notificaciones/preferencias/queries";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

const USER_ID = "5c7e14df-296e-4b18-8a19-b69274da647f";

function buildSupabaseMock(options: {
  userId?: string | null;
  row?: { resumen_diario_email: boolean } | null;
}) {
  const maybeSingle = vi.fn(() =>
    Promise.resolve({ data: options.row ?? null, error: null }),
  );
  // `eq` and `from` keep their declared parameters because the assertions read
  // them back with `toHaveBeenCalledWith`: drop the params and `vi.fn` infers a
  // zero-arg signature, which `tsc --noEmit` then rejects at the assertion.
  // `select` has no such assertion, so it takes none.
  const eq = vi.fn((_column: string, _value: string) => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((_table: string) => ({ select }));
  const getUser = vi.fn(() =>
    Promise.resolve({
      data: {
        user:
          options.userId === null ? null : { id: options.userId ?? USER_ID },
      },
    }),
  );

  return { client: { auth: { getUser }, from }, from, select, eq };
}

/**
 * Slice 13, reading half. The single behaviour worth defending here is DG3:
 * ABSENCE of a row means opted IN. The migration
 * (20260730193725_notificacion_preferencia_digest.sql) deliberately ships no
 * backfill, so most users have no row at all and a `null`-means-false read
 * would silently opt the entire userbase OUT of a digest they never disabled.
 */
describe("getResumenDiarioPreferencia (slice 13, spec DG3)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("returns the opted-IN default when the user has no row", async () => {
    const { client } = buildSupabaseMock({ row: null });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(getResumenDiarioPreferencia()).resolves.toBe(true);
    expect(RESUMEN_DIARIO_POR_DEFECTO).toBe(true);
  });

  it("returns false when the user has opted out", async () => {
    const { client } = buildSupabaseMock({
      row: { resumen_diario_email: false },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(getResumenDiarioPreferencia()).resolves.toBe(false);
  });

  it("returns true when the user has an explicit opted-in row", async () => {
    const { client } = buildSupabaseMock({
      row: { resumen_diario_email: true },
    });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(getResumenDiarioPreferencia()).resolves.toBe(true);
  });

  it("reads the v_ surface scoped to the caller, never the base table", async () => {
    const { client, from, eq } = buildSupabaseMock({ row: null });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await getResumenDiarioPreferencia();

    expect(from).toHaveBeenCalledWith("v_notificacion_preferencia");
    expect(eq).toHaveBeenCalledWith("usuario_id", USER_ID);
  });

  it("degrades to the default without a session instead of throwing", async () => {
    const { client, from } = buildSupabaseMock({ userId: null });
    mockedCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(getResumenDiarioPreferencia()).resolves.toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});
