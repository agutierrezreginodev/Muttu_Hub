import { test, expect, type Page } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Slice 5b/7 (design §6/D9, spec KM1/KM2). The assertions read the BOARD, never
 * the database: `estado` is not rendered on a card, but it is observable —
 * moving into a terminal column and back is exactly what the sync rule governs.
 *
 * Two rules this file learned from a CI failure that never reproduced locally:
 *
 * 1. **Every persistence assertion follows a `reload()`.** The board moves a
 *    card OPTIMISTICALLY, so asserting right after the click only proves the
 *    optimistic paint. Locally the round trip beat the assertion and it passed;
 *    in CI the page closed with the server action still in flight, the move was
 *    never persisted, and the failure surfaced in the NEXT test instead of this
 *    one.
 * 2. **Each test creates and deletes its own card.** An order-dependent chain
 *    breaks under Playwright's CI retries: the module-level title is recomputed
 *    on a retry, so the retried test hunts for a card that run never created —
 *    which is what turned one real failure into three confusing ones.
 */

async function crearTarea(page: Page, titulo: string) {
  await page.goto("/kanban");
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  // Scoped to the dialog: the filter form repeats these field labels.
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

function cardEnColumna(page: Page, columna: string, titulo: string) {
  return page
    .getByRole("region", { name: columna })
    .locator('[data-testid^="tarea-card-"]', { hasText: titulo });
}

async function moverA(page: Page, titulo: string, destino: string) {
  const drag = page.locator('[data-testid^="tarea-drag-"]', {
    hasText: titulo,
  });
  await drag.getByRole("button", { name: "Mover a…" }).click();
  await page.getByRole("menuitem", { name: destino }).click();
  // Read the move back from the server rather than trusting the optimistic UI.
  await page.reload();
}

test.describe("kanban flow", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("completing a card persists it, and reopening moves it back out of the terminal column", async ({
    page,
  }) => {
    const titulo = `E2E mover ${Date.now()}`;
    await crearTarea(page, titulo);

    // A brand-new card has a null `columna` and folds into the first column
    // (D3), so every column is a genuine destination in the menu.
    await moverA(page, titulo, "Completada");
    await expect(cardEnColumna(page, "Completada", titulo)).toBeVisible();

    await moverA(page, titulo, "Por hacer");
    // Design §6: leaving a terminal column reopens `estado` to `en_curso`. The
    // card must be OUT of "Completada", not merely also present in "Por hacer".
    await expect(cardEnColumna(page, "Por hacer", titulo)).toBeVisible();
    await expect(cardEnColumna(page, "Completada", titulo)).toHaveCount(0);

    await borrarTarea(page, titulo);
  });

  test("Mi tablero narrows the board by query, not by hiding rows", async ({
    page,
  }) => {
    const titulo = `E2E scope ${Date.now()}`;
    await crearTarea(page, titulo);

    await page.getByRole("link", { name: "Mi tablero" }).click();

    await expect(page).toHaveURL(/scope=mio/);
    // The card the admin just created is theirs, so it survives the narrow
    // scope — this asserts the filter is applied AND correct, not merely that
    // the page still renders.
    await expect(
      page.locator('[data-testid^="tarea-card-"]', { hasText: titulo }),
    ).toBeVisible();

    await borrarTarea(page, titulo);
  });
});

/**
 * Slice 7 (spec KM1/KM2): the detail route and its comment thread. Also the
 * bell's deep-link target, so an id the caller cannot see must 404 rather than
 * confirm the row exists.
 */
test.describe("kanban tarea detail", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("comments on a card and shows no way to edit or delete the comment", async ({
    page,
  }) => {
    const titulo = `E2E detalle ${Date.now()}`;
    await crearTarea(page, titulo);

    await page.getByRole("link", { name: "Lista" }).click();
    await page.getByRole("link", { name: titulo }).click();

    await expect(page).toHaveURL(/\/kanban\/\d+$/);
    await expect(page.getByText("Todavía no hay comentarios.")).toBeVisible();

    await page.getByLabel("Nuevo comentario").fill("Comentario de prueba E2E.");
    await page.getByRole("button", { name: "Comentar" }).click();

    const feed = page.getByRole("list", { name: "Comentarios" });
    await expect(feed.getByText("Comentario de prueba E2E.")).toBeVisible();
    await page.reload();
    // Read back from the server: an append that only ever existed in the client
    // would be silent data loss, and this thread has no edit path to recover
    // through.
    await expect(feed.getByText("Comentario de prueba E2E.")).toBeVisible();
    // KM2 is enforced by the absence of an UPDATE/DELETE grant, so the UI must
    // not offer a control that could only ever fail.
    await expect(feed.getByRole("button")).toHaveCount(0);

    await borrarTarea(page, titulo);
  });

  test("a tarea id that does not exist is a 404, not a permission message", async ({
    page,
  }) => {
    const response = await page.goto("/kanban/99999999");
    expect(response?.status()).toBe(404);
  });
});
