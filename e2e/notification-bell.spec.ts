import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Due-date bell (slice 10, NB1-NB4).
 *
 * The bell is server-rendered from the layout, so what this reaches for is the
 * property no unit test can: that the count the shell paints actually tracks
 * the database after a real write, with no cache-busting step in between.
 *
 * The test creates and completes its own tareas, so it shares no state with
 * any other spec and a retry starts where the first run did.
 */
test.describe("campana de vencimientos", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("counts the caller's own overdue and due-soon tareas, and drops one when it is completed", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const titulo = `Vence pronto ${Date.now()}`;

    await page.goto("/kanban");

    // A tarea due inside the 72h window, owned by the caller (the form
    // defaults responsable to the current user, KT1).
    await page.getByRole("button", { name: "Crear tarea" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título").fill(titulo);
    const enDosDias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await dialog.getByLabel("Fecha límite").fill(enDosDias);
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(titulo).first()).toBeVisible({
      timeout: 45_000,
    });

    // Assert after a reload, never on the paint the submit produced: the bell
    // is rendered by the layout, so only a fresh render proves it re-read.
    await page.reload();
    await page.getByRole("button", { name: /Notificaciones/ }).click();
    await expect(
      page.getByRole("menu", { name: "Notificaciones" }).getByText(titulo),
    ).toBeVisible();
    await expect(page.getByText("Vence pronto").first()).toBeVisible();
  });

  test("a task with no fecha límite never reaches the bell", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const titulo = `Sin fecha ${Date.now()}`;

    await page.goto("/kanban");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título").fill(titulo);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(titulo).first()).toBeVisible({
      timeout: 45_000,
    });

    await page.reload();
    await page.getByRole("button", { name: /Notificaciones/ }).click();

    await expect(
      page.getByRole("menu", { name: "Notificaciones" }).getByText(titulo),
    ).toHaveCount(0);
  });
});
