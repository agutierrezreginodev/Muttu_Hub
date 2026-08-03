import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { listCategoryGrants } from "@/lib/admin/category-grants";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function stubSelect(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  const from = vi.fn(() => builder);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCreateClient.mockResolvedValue({ from } as any);
  return { builder, from };
}

describe("listCategoryGrants (task 7.1/7.2, spec document-permissions)", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("groups granted categories by rol id", async () => {
    stubSelect({
      data: [
        { rol_id: 1, categoria: "contratos" },
        { rol_id: 1, categoria: "actas" },
        { rol_id: 2, categoria: "contratos" },
      ],
      error: null,
    });

    const grants = await listCategoryGrants();

    expect([...(grants.get(1) ?? [])].sort()).toEqual(["actas", "contratos"]);
    expect([...(grants.get(2) ?? [])]).toEqual(["contratos"]);
  });

  it("reads the grant table itself, which every authenticated user may SELECT", async () => {
    const { from } = stubSelect({ data: [], error: null });

    await listCategoryGrants();

    expect(from).toHaveBeenCalledWith("documento_categoria_permiso");
  });

  it("returns an empty map rather than throwing when there are no grants", async () => {
    stubSelect({ data: null, error: null });

    const grants = await listCategoryGrants();

    expect(grants.size).toBe(0);
  });
});
