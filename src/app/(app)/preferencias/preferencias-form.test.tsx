import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setResumenDiarioActionMock = vi.fn();

vi.mock("@/lib/notificaciones/preferencias/actions", () => ({
  setResumenDiarioAction: (...args: unknown[]) =>
    setResumenDiarioActionMock(...args),
}));

import { PreferenciasForm } from "./preferencias-form";

const TOGGLE_LABEL = "Recibir el resumen diario por correo";

describe("PreferenciasForm (slice 13)", () => {
  beforeEach(() => {
    setResumenDiarioActionMock.mockReset();
    setResumenDiarioActionMock.mockResolvedValue({ success: true });
  });

  it("reflects the opted-in state as a checked toggle", () => {
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    expect(screen.getByLabelText(TOGGLE_LABEL)).toBeChecked();
  });

  it("reflects the opted-out state as an unchecked toggle", () => {
    render(<PreferenciasForm resumenDiarioEmail={false} />);

    expect(screen.getByLabelText(TOGGLE_LABEL)).not.toBeChecked();
  });

  it("opts the user OUT: flips a checked toggle and saves false", async () => {
    const user = userEvent.setup();
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    await user.click(screen.getByLabelText(TOGGLE_LABEL));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(setResumenDiarioActionMock).toHaveBeenCalledWith({
        resumenDiarioEmail: false,
      });
    });
  });

  it("opts the user back IN: flips an unchecked toggle and saves true", async () => {
    const user = userEvent.setup();
    render(<PreferenciasForm resumenDiarioEmail={false} />);

    await user.click(screen.getByLabelText(TOGGLE_LABEL));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(setResumenDiarioActionMock).toHaveBeenCalledWith({
        resumenDiarioEmail: true,
      });
    });
  });

  it("saves the unchanged value when the user submits without toggling", async () => {
    const user = userEvent.setup();
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(setResumenDiarioActionMock).toHaveBeenCalledWith({
        resumenDiarioEmail: true,
      });
    });
  });

  it("confirms the save to the user", async () => {
    const user = userEvent.setup();
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("Preferencias guardadas."),
    ).toBeInTheDocument();
  });

  it("surfaces the action's error and leaves the toggle where the user put it", async () => {
    setResumenDiarioActionMock.mockResolvedValue({
      error: "Ocurrió un error. Intentá de nuevo.",
    });
    const user = userEvent.setup();
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    await user.click(screen.getByLabelText(TOGGLE_LABEL));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error. Intentá de nuevo.",
    );
    expect(screen.getByLabelText(TOGGLE_LABEL)).not.toBeChecked();
  });

  it("describes the digest ON the toggle itself, so opting out is an informed choice", () => {
    render(<PreferenciasForm resumenDiarioEmail={true} />);

    // Not merely "a paragraph exists somewhere": the explanation is what makes
    // this an informed choice, so it has to reach a screen-reader user as the
    // control's own description rather than as unattached nearby text.
    expect(screen.getByLabelText(TOGGLE_LABEL)).toHaveAccessibleDescription(
      /Un correo cada mañana/,
    );
  });
});
