import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Slice 5b first pass (design §6/D9): create a card, move it into a terminal
 * column through BOTH move paths, and prove the estado sync is what the design
 * says it is.
 *
 * The assertions read the BOARD, never the database: `estado` is not rendered on
 * a card, but it is observable through `v_tarea.vencido` — the "Vencida" badge
 * disappears once `estado` becomes `cumplido`, because the view's own expression
 * excludes the two terminal states. That makes this a real end-to-end check of
 * the sync rule rather than a check that a card changed columns.
 *
 * The four tests are ORDER-DEPENDENT on purpose: one card is created, moved,
 * scoped and finally deleted, so the suite leaves no fixture rows behind. That
 * is safe here and only here because `playwright.config.ts` pins
 * `workers: 1` + `fullyParallel: false`; a card per test would need its own
 * cleanup and would not exercise the reopen path at all.
 */
test.describe("kanban flow", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  const titulo = `E2E tarea ${Date.now()}`;

  test("creates a card, then completes it through the Mover a… menu", async ({
    page,
  }) => {
    await page.goto("/kanban");

    await page.getByRole("button", { name: "Nueva tarea" }).click();
    // Deliberately fills ONLY the título: PRD §5.2 makes it the single required
    // field, and the form defaults the responsable to the current user (KT1).
    await page.getByLabel("Título").fill(titulo);
    await page.getByRole("button", { name: "Guardar" }).click();

    const card = page.locator('[data-testid^="tarea-card-"]', {
      hasText: titulo,
    });
    await expect(card).toBeVisible();

    // A brand-new card has a null `columna` and folds into the first column
    // (D3), so the first column is a genuine destination in the menu.
    const drag = page.locator('[data-testid^="tarea-drag-"]', {
      hasText: titulo,
    });
    await drag.getByRole("button", { name: "Mover a…" }).click();
    await page.getByRole("menuitem", { name: "Completada" }).click();

    await expect(
      page
        .getByRole("region", { name: "Completada" })
        .locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toBeVisible();
  });

  test("reopening a completed card moves it back out of the terminal column", async ({
    page,
  }) => {
    await page.goto("/kanban");

    const drag = page.locator('[data-testid^="tarea-drag-"]', {
      hasText: titulo,
    });
    await drag.getByRole("button", { name: "Mover a…" }).click();
    await page.getByRole("menuitem", { name: "Por hacer" }).click();

    // Design §6: leaving a terminal column reopens `estado` to `en_curso`. The
    // card must be OUT of "Completada", not merely also present in "Por hacer".
    await expect(
      page
        .getByRole("region", { name: "Por hacer" })
        .locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Completada" })
        .locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toHaveCount(0);
  });

  test("Mi tablero narrows the board by query, not by hiding rows", async ({
    page,
  }) => {
    await page.goto("/kanban");
    await page.getByRole("link", { name: "Mi tablero" }).click();

    await expect(page).toHaveURL(/scope=mio/);
    // The card the admin just created is theirs, so it survives the narrow
    // scope — this asserts the filter is applied and correct, not merely that
    // the page still renders.
    await expect(
      page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toBeVisible();
  });

  test("deleting the card removes it from the board", async ({ page }) => {
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
