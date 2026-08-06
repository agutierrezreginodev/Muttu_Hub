import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Promote a CRM compromiso onto the Kanban board (slice 9, spec KP2).
 *
 * The property worth a browser is the OVERLAP: a promoted compromiso must
 * appear on the board AND stay in the Compromisos tab. Two unit tests can each
 * confirm one half while the pair is still broken, because the two views are
 * filtered by different `origen` sets and `'Ambos'` is the only value in both.
 *
 * The test creates and promotes its own row and demotes it again, so it holds
 * no shared state and a retry starts from the same place the first run did.
 */
test.describe("promover un compromiso al tablero", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("a promoted compromiso reaches the board and stays in the tab", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const clienteNombre = `E2E Promote ${Date.now()}`;
    const compromisoTitulo = `Compromiso promovido ${Date.now()}`;

    // --- A cliente to hang the compromiso off ---
    // Same shape crm-flow and documentos use: creating a cliente does NOT
    // navigate, so the list link is what takes you to the ficha.
    await page.goto("/crm");
    await page.getByRole("button", { name: "Crear cliente" }).click();
    const clienteDialog = page.getByRole("dialog");
    await clienteDialog.locator("#cliente-nombre").fill(clienteNombre);
    await clienteDialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();
    await page.getByRole("link", { name: clienteNombre }).click();
    await page.waitForURL(/\/crm\/\d+$/, { timeout: 45_000 });

    // --- A compromiso on it ---
    await page.getByRole("link", { name: "Compromisos" }).click();
    await page.waitForURL(/\/crm\/\d+\/compromisos$/, { timeout: 45_000 });
    await page.getByRole("button", { name: "Crear compromiso" }).click();
    const compromisoDialog = page.getByRole("dialog");
    await compromisoDialog.getByLabel("Título").fill(compromisoTitulo);
    await page.getByRole("button", { name: "Guardar" }).click();
    // Scoped to the table's own badge: the ficha header also renders this
    // title as the "próximo compromiso", so an unscoped text match resolves to
    // two elements and fails strict mode.
    const filaCompromiso = page
      .locator('[data-testid^="tarea-titulo-badge-"]')
      .filter({ hasText: compromisoTitulo });
    await expect(filaCompromiso).toBeVisible({ timeout: 45_000 });

    // --- Promote it ---
    await page.getByRole("button", { name: "Poner en el tablero" }).click();
    await expect(
      page.getByRole("button", { name: "Quitar del tablero" }),
    ).toBeVisible({ timeout: 45_000 });

    // It must still be here. Asserted after a reload, never on the paint the
    // click produced.
    await page.reload();
    await expect(
      page
        .locator('[data-testid^="tarea-titulo-badge-"]')
        .filter({ hasText: compromisoTitulo }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Quitar del tablero" }),
    ).toBeVisible();

    // --- And it must now also be on the board ---
    await page.goto("/kanban?scope=equipo");
    await expect(page.getByText(compromisoTitulo)).toBeVisible({
      timeout: 45_000,
    });

    // --- Demote: off the board, still in the tab ---
    await page.goBack();
    await page.reload();
    await page.getByRole("button", { name: "Quitar del tablero" }).click();
    await expect(
      page.getByRole("button", { name: "Poner en el tablero" }),
    ).toBeVisible({ timeout: 45_000 });

    await page.goto("/kanban?scope=equipo");
    await expect(page.getByText(compromisoTitulo)).toHaveCount(0);
  });
});
