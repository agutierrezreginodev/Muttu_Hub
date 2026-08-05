import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Slice 6 (spec KV1/KV2): the list view is the same dataset as the board, and
 * the filters are QUERIES — every assertion below navigates and re-reads the
 * server's answer rather than checking that something disappeared client-side.
 *
 * Order-dependent like `kanban-flow.spec.ts`, and for the same reason: one card
 * is created, filtered against, and deleted, so the suite leaves no rows behind.
 * Safe only because the config pins `workers: 1` and `fullyParallel: false`.
 */
test.describe("kanban list view", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  const titulo = `E2E lista ${Date.now()}`;

  test("a card created on the board appears in the list", async ({ page }) => {
    await page.goto("/kanban");
    await page.getByRole("button", { name: "Nueva tarea" }).click();
    // Scoped to the dialog on purpose: the filter form on the same page carries
    // the same field labels, so an unscoped getByLabel is ambiguous. The card is
    // left WITHOUT a prioridad, which is what the next test filters against.
    await page.getByRole("dialog").getByLabel("Título").fill(titulo);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(
      page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Lista" }).click();

    await expect(page).toHaveURL(/\/kanban\/lista/);
    await expect(page.getByRole("cell", { name: titulo })).toBeVisible();
  });

  test("filtering by prioridad narrows the list through the URL", async ({
    page,
  }) => {
    await page.goto("/kanban/lista");

    await page.getByLabel("Prioridad").selectOption("Alta");
    await page.getByRole("button", { name: "Aplicar" }).click();

    // The filter has to be in the URL, not in component state: that is what
    // makes it a server query, deep-linkable and back-button correct. The card
    // above has no prioridad, so any prioridad filter must exclude it.
    await expect(page).toHaveURL(/prioridad=Alta/);
    await expect(page.getByRole("cell", { name: titulo })).toHaveCount(0);

    await page.getByRole("link", { name: "Limpiar filtros" }).click();
    await expect(page.getByRole("cell", { name: titulo })).toBeVisible();
  });

  test("switching view keeps the filters instead of resetting them", async ({
    page,
  }) => {
    await page.goto("/kanban/lista?prioridad=Alta");

    await page.getByRole("link", { name: "Tablero" }).click();

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

  test("cleans up the card it created", async ({ page }) => {
    await page.goto("/kanban");

    const drag = page.locator('[data-testid^="tarea-drag-"]', {
      hasText: titulo,
    });
    await drag.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();

    await expect(
      page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toHaveCount(0);
  });
});
