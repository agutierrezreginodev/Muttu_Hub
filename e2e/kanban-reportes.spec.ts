import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

/**
 * Board reports (slice 8, spec KR1/KR2).
 *
 * Two properties are worth reaching for through a real browser rather than a
 * unit test: that the Reportes tab is actually navigable (a tab whose route
 * does not exist is the dead-link failure `dashboard-mi-resumen.spec.ts` was
 * written against), and that the Mi tablero / Equipo completo scope survives
 * into the reports. A report that silently widened to the whole team would be
 * a quiet privacy surprise, not merely an inconsistency.
 */
test.describe("kanban reportes", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("the Reportes tab navigates from the board", async ({ page }) => {
    await page.goto("/kanban");

    await page.getByRole("link", { name: "Reportes", exact: true }).click();

    await expect(page).toHaveURL(/\/kanban\/reportes/);
    await expect(
      page.getByRole("heading", { name: "Reportes del tablero" }),
    ).toBeVisible();
  });

  test("renders every distribution", async ({ page }) => {
    await page.goto("/kanban/reportes");

    await expect(page.getByText("Por estado")).toBeVisible();
    await expect(page.getByText("Por responsable")).toBeVisible();
    await expect(page.getByText("Por prioridad")).toBeVisible();
    await expect(page.getByText("Por etiqueta")).toBeVisible();
    await expect(page.getByText("Tareas en vista").first()).toBeVisible();
  });

  test("carries the scope from the board into the reports", async ({
    page,
  }) => {
    await page.goto("/kanban?scope=mio");

    await page.getByRole("link", { name: "Reportes", exact: true }).click();

    // The tab must not drop the scope: the reports count the rows the board
    // shows, so losing it here would count a different set than the view the
    // user switched away from.
    await expect(page).toHaveURL(/scope=mio/);
  });

  test("offers no export or download control (KR2)", async ({ page }) => {
    await page.goto("/kanban/reportes");
    await expect(
      page.getByRole("heading", { name: "Reportes del tablero" }),
    ).toBeVisible();

    // `kanban.exportar` is seeded but deliberately unenforced in v1, so the
    // reports stay on-screen only. Matching on the words a Spanish UI would
    // use for it rather than on a class or test id.
    await expect(
      page.getByRole("button", { name: /exportar|descargar|csv|excel/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /exportar|descargar|csv|excel/i }),
    ).toHaveCount(0);
  });
});
