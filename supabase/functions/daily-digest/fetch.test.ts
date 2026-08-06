import { describe, expect, it } from "vitest";

import { fetchDueTareas, type DigestClient } from "./fetch.ts";
import type { DigestRow } from "./aggregate.ts";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";
const HORIZON = new Date("2026-08-09T12:00:00.000Z");

interface SeedRow extends DigestRow {
  responsable_id: string;
}

/**
 * The mock APPLIES the filters it is given rather than merely recording them.
 * A missing `.eq('responsable_id', ...)` therefore surfaces as user B's rows
 * appearing in user A's result — the actual failure — instead of as an
 * assertion nobody wrote.
 */
function buildClient(rows: SeedRow[]) {
  const calls: [string, unknown][] = [];
  let filtered = [...rows];

  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      calls.push([column, value]);
      filtered = filtered.filter(
        (row) => (row as unknown as Record<string, unknown>)[column] === value,
      );
      return query;
    },
    in: (column: string, values: readonly unknown[]) => {
      calls.push([column, values]);
      filtered = filtered.filter((row) =>
        values.includes((row as unknown as Record<string, unknown>)[column]),
      );
      return query;
    },
    not: () => {
      filtered = filtered.filter((row) => row.fecha_limite !== null);
      return query;
    },
    lte: (column: string, value: unknown) => {
      calls.push([column, value]);
      filtered = filtered.filter(
        (row) => (row.fecha_limite ?? "") <= String(value),
      );
      return query;
    },
    order: () => Promise.resolve({ data: filtered, error: null }),
  };

  const client: DigestClient = { from: () => query };
  return { client, calls };
}

function seed(overrides: Partial<SeedRow> = {}): SeedRow {
  return {
    id: 1,
    titulo: "Enviar propuesta",
    fecha_limite: "2026-08-07T12:00:00.000Z",
    estado: "pendiente",
    origen: "Kanban",
    cliente_id: null,
    responsable_id: USER_A,
    ...overrides,
  };
}

describe("fetchDueTareas — digest scoping (slice 11a, design D6(e))", () => {
  it("SECURITY: returns none of user B's rows when fetching for user A", async () => {
    const { client } = buildClient([
      seed({ id: 1, responsable_id: USER_A }),
      seed({ id: 2, responsable_id: USER_B, titulo: "Privado de B" }),
      seed({ id: 3, responsable_id: USER_B, titulo: "También de B" }),
    ]);

    const rows = await fetchDueTareas(client, USER_A, HORIZON);

    expect(rows.map((row) => row.id)).toEqual([1]);
  });

  it("SECURITY: always narrows by responsable_id in the query itself", async () => {
    const { client, calls } = buildClient([seed()]);

    await fetchDueTareas(client, USER_A, HORIZON);

    // The digest runs under the service role, which bypasses RLS. If the rows
    // were fetched table-wide and bucketed in application code, one bucketing
    // bug would email a person about someone else's work. Narrowing in the
    // query means B's rows are never fetched at all.
    expect(calls).toContainEqual(["responsable_id", USER_A]);
  });

  it("filters estado by the shared active set, never by vencido", async () => {
    const { client, calls } = buildClient([seed()]);

    await fetchDueTareas(client, USER_A, HORIZON);

    expect(calls).toContainEqual(["estado", ["pendiente", "en_curso"]]);
    expect(calls.map(([column]) => column)).not.toContain("vencido");
  });

  it("excludes rows past the horizon and rows with no fecha límite", async () => {
    const { client } = buildClient([
      seed({ id: 1, fecha_limite: "2026-08-07T12:00:00.000Z" }),
      seed({ id: 2, fecha_limite: "2026-09-01T12:00:00.000Z" }),
      seed({ id: 3, fecha_limite: null }),
    ]);

    const rows = await fetchDueTareas(client, USER_A, HORIZON);

    expect(rows.map((row) => row.id)).toEqual([1]);
  });

  it("returns an empty array when the query yields nothing", async () => {
    const { client } = buildClient([]);

    await expect(fetchDueTareas(client, USER_A, HORIZON)).resolves.toEqual([]);
  });
});
