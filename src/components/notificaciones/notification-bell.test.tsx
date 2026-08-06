import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotificationBell } from "@/components/notificaciones/notification-bell";
import type { VencimientoItem } from "@/lib/notificaciones/vencimiento";

function item(overrides: Partial<VencimientoItem> = {}): VencimientoItem {
  return {
    id: 1,
    titulo: "Enviar propuesta",
    fechaLimite: "2026-08-05T12:00:00.000Z",
    estado: "vencido",
    origen: "Kanban",
    clienteId: null,
    ...overrides,
  };
}

describe("NotificationBell (slice 10, NB1-NB4)", () => {
  it("labels the count for assistive tech, not just visually", () => {
    render(<NotificationBell count={3} items={[item(), item({ id: 2 })]} />);

    expect(
      screen.getByRole("button", { name: "Notificaciones (3)" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notification-count")).toHaveTextContent("3");
  });

  it("shows no count badge at zero rather than a bare 0", () => {
    render(<NotificationBell count={0} items={[]} />);

    expect(screen.queryByTestId("notification-count")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notificaciones (0)" }),
    ).toBeInTheDocument();
  });

  it("starts closed and toggles aria-expanded", async () => {
    const user = userEvent.setup();
    render(<NotificationBell count={1} items={[item()]} />);

    const trigger = screen.getByRole("button", { name: /Notificaciones/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("shows the empty state when opened with nothing due", async () => {
    const user = userEvent.setup();
    render(<NotificationBell count={0} items={[]} />);

    await user.click(screen.getByRole("button", { name: /Notificaciones/ }));

    expect(
      screen.getByText("No tenés tareas vencidas ni por vencer."),
    ).toBeInTheDocument();
  });

  it("distinguishes overdue from due-soon by TEXT, never by colour alone", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell
        count={2}
        items={[
          item({ id: 1, estado: "vencido", titulo: "Ya vencida" }),
          item({
            id: 2,
            estado: "vence_pronto",
            titulo: "Vence en dos días",
            fechaLimite: "2026-08-08T12:00:00.000Z",
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Notificaciones/ }));

    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.getByText("Vence pronto")).toBeInTheDocument();
  });

  it("orders items by fecha límite, soonest first", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell
        count={2}
        items={[
          item({
            id: 1,
            titulo: "Más tarde",
            fechaLimite: "2026-08-09T12:00:00.000Z",
            estado: "vence_pronto",
          }),
          item({
            id: 2,
            titulo: "Más urgente",
            fechaLimite: "2026-08-01T12:00:00.000Z",
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Notificaciones/ }));

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Más urgente");
    expect(links[1]).toHaveTextContent("Más tarde");
  });

  it("deep-links each item to where its context lives", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell
        count={2}
        items={[
          item({ id: 1, origen: "Kanban", clienteId: null }),
          item({
            id: 2,
            origen: "Ambos",
            clienteId: 42,
            titulo: "Compromiso promovido",
            fechaLimite: "2026-08-06T12:00:00.000Z",
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Notificaciones/ }));

    expect(screen.getByRole("link", { name: /Enviar propuesta/ })).toHaveAttribute(
      "href",
      "/kanban/1",
    );
    expect(
      screen.getByRole("link", { name: /Compromiso promovido/ }),
    ).toHaveAttribute("href", "/crm/42/compromisos");
  });

  it("offers no dismiss or mark-as-read control — it is not an inbox", async () => {
    const user = userEvent.setup();
    render(<NotificationBell count={1} items={[item()]} />);

    await user.click(screen.getByRole("button", { name: /Notificaciones/ }));

    // Items are a live query over v_tarea. A row leaves this list by being
    // completed or rescheduled, never by being acknowledged — so an
    // acknowledge affordance would promise state that is not stored anywhere.
    expect(
      screen.queryByRole("button", { name: /descartar|marcar|leído/i }),
    ).not.toBeInTheDocument();
  });
});
