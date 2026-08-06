import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import {
  countVencimientos,
  getVencimientos,
} from "@/lib/notificaciones/queries";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

const NOW = new Date("2026-08-06T12:00:00.000Z");
const HORA = 60 * 60 * 1000;
const at = (hours: number) =>
  new Date(NOW.getTime() + hours * HORA).toISOString();

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

interface Row {
  id: number;
  titulo: string;
  fecha_limite: string | null;
  estado: string;
  origen: string;
  cliente_id: number | null;
  responsable_id: string;
}

/**
 * Applies the filters the query asks for, so a missing `.eq` shows up as user
 * B's rows leaking into user A's result rather than as an unasserted call.
 */
function buildSupabaseMock(rows: Row[]) {
  const calls: { eq: [string, unknown][]; in: [string, unknown][] } = {
    eq: [],
    in: [],
  };
  let filtered = [...rows];

  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      calls.eq.push([column, value]);
      filtered = filtered.filter(
        (row) => (row as unknown as Record<string, unknown>)[column] === value,
      );
      return chain;
    },
    in: (column: string, values: readonly unknown[]) => {
      calls.in.push([column, values]);
      filtered = filtered.filter((row) =>
        values.includes((row as unknown as Record<string, unknown>)[column]),
      );
      return chain;
    },
    not: () => {
      filtered = filtered.filter((row) => row.fecha_limite !== null);
      return chain;
    },
    lte: (_column: string, value: string) => {
      filtered = filtered.filter(
        (row) => (row.fecha_limite ?? "") <= value,
      );
      return chain;
    },
    order: () => Promise.resolve({ data: filtered, error: null }),
  };

  return { client: { from: vi.fn(() => chain) }, calls };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    titulo: "Enviar propuesta",
    fecha_limite: at(-2),
    estado: "pendiente",
    origen: "Kanban",
    cliente_id: null,
    responsable_id: USER_A,
    ...overrides,
  };
}

function useRows(rows: Row[]) {
  const mock = buildSupabaseMock(rows);
  mockedCreateClient.mockResolvedValue(
    mock.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return mock;
}

describe("getVencimientos (slice 10, NB7)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("returns only the caller's own rows — SECURITY", () => {
    const mock = useRows([
      row({ id: 1, responsable_id: USER_A }),
      row({ id: 2, responsable_id: USER_B, titulo: "De otra persona" }),
    ]);

    return getVencimientos(USER_A, NOW).then((items) => {
      expect(items.map((item) => item.id)).toEqual([1]);
      expect(mock.calls.eq).toContainEqual(["responsable_id", USER_A]);
    });
  });

  it("filters estado by the explicit active set, never by vencido", async () => {
    const mock = useRows([row()]);

    await getVencimientos(USER_A, NOW);

    const estadoFilter = mock.calls.in.find(([column]) => column === "estado");
    expect(estadoFilter?.[1]).toEqual(["pendiente", "en_curso"]);
    // A `vencido=true` filter would drag past-due borrador rows into the bell,
    // which is exactly what classify() refuses to do (C10). The query must not
    // reintroduce through SQL what the model deliberately excludes.
    expect(mock.calls.eq).not.toContainEqual(["vencido", true]);
  });

  it("classifies each surviving row rather than trusting the filter alone", async () => {
    useRows([
      row({ id: 1, fecha_limite: at(-2) }),
      row({ id: 2, fecha_limite: at(24), estado: "en_curso" }),
    ]);

    const items = await getVencimientos(USER_A, NOW);

    expect(items).toEqual([
      expect.objectContaining({ id: 1, estado: "vencido" }),
      expect.objectContaining({ id: 2, estado: "vence_pronto" }),
    ]);
  });

  it("drops a past-due borrador even if the query returned it", async () => {
    // The `.in()` filter should already exclude it; classify() is the second
    // gate, so a loosened query cannot silently start alerting on drafts.
    useRows([row({ id: 1, estado: "borrador", fecha_limite: at(-48) })]);

    await expect(getVencimientos(USER_A, NOW)).resolves.toEqual([]);
  });

  it("returns an empty list rather than throwing when nothing is visible", async () => {
    useRows([]);

    await expect(getVencimientos(USER_A, NOW)).resolves.toEqual([]);
  });
});

describe("countVencimientos (slice 10)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("counts exactly what the list contains", async () => {
    useRows([
      row({ id: 1 }),
      row({ id: 2, fecha_limite: at(24), estado: "en_curso" }),
      row({ id: 3, responsable_id: USER_B }),
    ]);

    await expect(countVencimientos(USER_A, NOW)).resolves.toBe(2);
  });
});
