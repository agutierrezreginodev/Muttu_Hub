import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MoverAMenu } from "./mover-a-menu";

const COLUMNAS = [
  { codigo: "por_hacer", etiqueta: "Por hacer" },
  { codigo: "en_curso", etiqueta: "En curso" },
  { codigo: "cumplido", etiqueta: "Completada" },
];

const onSelect = vi.fn();

beforeEach(() => {
  onSelect.mockReset();
});

/**
 * Design D9: this is a FIRST-CLASS path, not a fallback. Native HTML5 drag and
 * drop is neither touch-capable nor keyboard-accessible, so for a phone or a
 * keyboard user this menu is the ONLY way to move a card. It therefore gets the
 * same coverage as the drag path.
 */
describe("MoverAMenu (design D9 — the touch/keyboard move path)", () => {
  it("is a collapsed disclosure until activated", () => {
    render(
      <MoverAMenu
        columnas={COLUMNAS}
        columnaActual="por_hacer"
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Mover a…" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menuitem", { name: "En curso" })).toBeNull();
  });

  it("offers every OTHER column and never the one the card is already in", async () => {
    const user = userEvent.setup();
    render(
      <MoverAMenu
        columnas={COLUMNAS}
        columnaActual="por_hacer"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover a…" }));

    expect(screen.getByRole("menuitem", { name: "En curso" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Completada" })).toBeVisible();
    // Moving a card where it already is would be a no-op round trip.
    expect(screen.queryByRole("menuitem", { name: "Por hacer" })).toBeNull();
  });

  it("offers every column when the card has no stored columna yet", async () => {
    const user = userEvent.setup();
    render(
      <MoverAMenu
        columnas={COLUMNAS}
        columnaActual={null}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover a…" }));

    // D3: a null `columna` RENDERS in the first column but is not stored as it,
    // so the first column is a real destination here, not a no-op.
    expect(screen.getByRole("menuitem", { name: "Por hacer" })).toBeVisible();
  });

  it("reports the chosen column code, not its renamable label", async () => {
    const user = userEvent.setup();
    render(
      <MoverAMenu
        columnas={COLUMNAS}
        columnaActual="por_hacer"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover a…" }));
    await user.click(screen.getByRole("menuitem", { name: "Completada" }));

    // `etiqueta` is admin-editable; `codigo` is not (absent from catalogo's
    // UPDATE grant), so the code is the only safe thing to send.
    expect(onSelect).toHaveBeenCalledWith("cumplido");
  });

  it("collapses again after a choice", async () => {
    const user = userEvent.setup();
    render(
      <MoverAMenu
        columnas={COLUMNAS}
        columnaActual="por_hacer"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mover a…" }));
    await user.click(screen.getByRole("menuitem", { name: "Completada" }));

    expect(screen.getByRole("button", { name: "Mover a…" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
