import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { rpcMock, redirectMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  redirectMock: vi.fn(() => {
    // Mirrors next/navigation's real redirect(): it throws, execution never
    // continues past the call site.
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: rpcMock,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import KanbanLayout from "./layout";

/**
 * Slice 4a (tasks: sdd/kanban-module/tasks). Copies `(app)/crm/layout.tsx`'s
 * gate VERBATIM (design part 2 §12): a real DB permission check via the
 * `has_permission` RPC, `redirect('/')` on denial or error, and no distinct
 * "forbidden" page — so opening `/kanban` never confirms to a
 * non-authorized caller that it exists, exactly like `/crm`.
 */
describe("Kanban module gate (mirrors (app)/crm/layout.tsx verbatim)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects home when the caller lacks kanban.ver", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });

    await expect(
      KanbanLayout({ children: <div>tablero</div> }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(rpcMock).toHaveBeenCalledWith("has_permission", {
      modulo: "kanban",
      accion: "ver",
    });
  });

  it("redirects home (fail-closed) when the RPC itself errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("boom") });

    await expect(
      KanbanLayout({ children: <div>tablero</div> }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("renders children when the caller holds kanban.ver — no redirect", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    const jsx = await KanbanLayout({ children: <div>tablero</div> });
    render(jsx);

    expect(screen.getByText("tablero")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
