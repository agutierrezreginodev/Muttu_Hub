import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth/actions", () => ({
  logoutAction: vi.fn(),
}));

import { UserMenu } from "./user-menu";

/**
 * Slice 13 gives the menu its second entry. The disclosure was previously a
 * one-item menu, so "the menu opens and holds more than sign-out" is new
 * behaviour worth pinning — a Preferencias entry that renders nowhere is the
 * same dead-link failure `dashboard-mi-resumen.spec.ts` was written against.
 */
describe("UserMenu", () => {
  it("keeps the menu closed until the trigger is pressed", () => {
    render(<UserMenu nombre="Ana Pérez" email="ana@muttu-hub.test" />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ana Pérez" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("offers Preferencias and Cerrar sesión once open", async () => {
    const user = userEvent.setup();
    render(<UserMenu nombre="Ana Pérez" email="ana@muttu-hub.test" />);

    await user.click(screen.getByRole("button", { name: "Ana Pérez" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Preferencias" }),
    ).toHaveAttribute("href", "/preferencias");
    expect(
      screen.getByRole("menuitem", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });
});
