import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const togglePromoteCompromisoActionMock = vi.fn();

vi.mock("@/lib/kanban/actions", () => ({
  togglePromoteCompromisoAction: (...args: unknown[]) =>
    togglePromoteCompromisoActionMock(...args),
}));

import { PromoteToggle } from "./promote-toggle";

describe("PromoteToggle (slice 9, spec KP2)", () => {
  beforeEach(() => {
    togglePromoteCompromisoActionMock.mockReset();
    togglePromoteCompromisoActionMock.mockResolvedValue({ success: true });
  });

  it("offers to promote a CRM-only compromiso", () => {
    render(<PromoteToggle tareaId={7} origen="CRM" />);

    const button = screen.getByRole("button", {
      name: "Poner en el tablero",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("offers to demote one that is already on the board", () => {
    render(<PromoteToggle tareaId={7} origen="Ambos" />);

    const button = screen.getByRole("button", { name: "Quitar del tablero" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("promotes, then shows the opposite action", async () => {
    const user = userEvent.setup();
    render(<PromoteToggle tareaId={7} origen="CRM" />);

    await user.click(screen.getByRole("button", { name: "Poner en el tablero" }));

    await waitFor(() => {
      expect(togglePromoteCompromisoActionMock).toHaveBeenCalledWith(7, true);
    });
    expect(
      await screen.findByRole("button", { name: "Quitar del tablero" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("demotes, then shows the opposite action", async () => {
    const user = userEvent.setup();
    render(<PromoteToggle tareaId={7} origen="Ambos" />);

    await user.click(screen.getByRole("button", { name: "Quitar del tablero" }));

    await waitFor(() => {
      expect(togglePromoteCompromisoActionMock).toHaveBeenCalledWith(7, false);
    });
    expect(
      await screen.findByRole("button", { name: "Poner en el tablero" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the old state visible when the server refuses", async () => {
    togglePromoteCompromisoActionMock.mockResolvedValue({
      error: "Esta tarea nació en el tablero, así que no se promueve desde el CRM.",
    });
    const user = userEvent.setup();
    render(<PromoteToggle tareaId={7} origen="CRM" />);

    await user.click(screen.getByRole("button", { name: "Poner en el tablero" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta tarea nació en el tablero",
    );
    // The label must NOT have flipped: `origen` decides whether a card exists
    // on another screen entirely, so showing it as promoted after a refusal
    // would be a lie the user cannot see through from here.
    expect(
      screen.getByRole("button", { name: "Poner en el tablero" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
