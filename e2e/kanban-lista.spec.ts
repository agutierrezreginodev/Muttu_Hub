import { test, expect, type Page } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Slice 6 (spec KV1/KV2): the list view is the same dataset as the board, and
 * the filters are QUERIES — every assertion navigates and re-reads the server's
 * answer rather than checking that something disappeared client-side.
 *
 * Each test owns its card and cleans it up. An order-dependent chain does not
 * survive Playwright's CI retries: the module-level title is recomputed on a
 * retry, so the retried test hunts for a card that run never created.
 */

async function crearTarea(page: Page, titulo: string) {
  await page.goto("/kanban");
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  // Scoped to the dialog: the filter form repeats these field labels. The card
  // is deliberately left WITHOUT a prioridad — that is what the filter test
  // narrows against.
  await page.getByRole("dialog").getByLabel("Título").fill(titulo);
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(
    page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
  ).toBeVisible();
}

async function borrarTarea(page: Page, titulo: string) {
  await page.goto("/kanban");
  const drag = page.locator('[data-testid^="tarea-drag-"]', {
    hasText: titulo,
  });
  await drag.getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();

  await page.reload();
  await expect(
    page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
  ).toHaveCount(0);
}

test.describe("kanban list view", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("a card created on the board appears in the list", async ({ page }) => {
    const titulo = `E2E lista ${Date.now()}`;
    await crearTarea(page, titulo);

    await page.goto("/kanban/lista");

    await expect(page.getByRole("cell", { name: titulo })).toBeVisible();

    await borrarTarea(page, titulo);
  });

  test("filtering by prioridad narrows the list through the URL", async ({
    page,
  }) => {
    const titulo = `E2E filtro ${Date.now()}`;
    await crearTarea(page, titulo);
    await page.goto("/kanban/lista");
    await expect(page.getByRole("cell", { name: titulo })).toBeVisible();

    await page.getByLabel("Prioridad").selectOption("Alta");
    await page.getByRole("button", { name: "Aplicar" }).click();

    // The filter has to live in the URL, not in component state: that is what
    // makes it a server query, deep-linkable and back-button correct. The card
    // has no prioridad, so any prioridad filter must exclude it.
    await expect(page).toHaveURL(/prioridad=Alta/);
    await expect(page.getByRole("cell", { name: titulo })).toHaveCount(0);

    await page.getByRole("link", { name: "Limpiar filtros" }).click();
    await expect(page.getByRole("cell", { name: titulo })).toBeVisible();

    await borrarTarea(page, titulo);
  });

  test("switching view keeps the filters instead of resetting them", async ({
    page,
  }) => {
    await page.goto("/kanban/lista?prioridad=Alta");

    await page.getByRole("link", { name: "Tablero", exact: true }).click();

    // KV1: the two views are presentations of ONE filtered dataset.
    await expect(page).toHaveURL(/\/kanban\?.*prioridad=Alta/);
    await expect(page.getByLabel("Prioridad")).toHaveValue("Alta");
  });

  test("Mi tablero survives applying a filter", async ({ page }) => {
    await page.goto("/kanban/lista?scope=mio");

    await page.getByLabel("Prioridad").selectOption("Alta");
    await page.getByRole("button", { name: "Aplicar" }).click();

    // Scope and filters share one URL but are separate intents: submitting the
    // filter form must not drop the user back to the whole team's rows.
    await expect(page).toHaveURL(/scope=mio/);
    await expect(
      page.getByRole("link", { name: "Mi tablero" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
