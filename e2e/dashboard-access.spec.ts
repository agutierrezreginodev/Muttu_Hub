import { test, expect } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DOC_NOEXPORT_STORAGE_STATE_PATH,
} from "./env";

/**
 * Spec dashboard-pipeline "Pipeline is reachable only through the
 * dashboard gate and is the default landing face" (task 2.9). Two
 * sessions:
 *   - admin (`dashboard.ver` holder, seed.sql Administrador) reaches
 *     `/dashboard` and lands on the Pipeline tab.
 *   - the documentos "sin exportar" fixture role (`dashboard.ver=false`,
 *     `e2e/utils/documentos-fixtures.ts`) is redirected to `/` — identical
 *     to the CRM/Admin gate behavior, no distinct "forbidden" page.
 */
test.describe("dashboard access gate", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("dashboard.ver holder lands on Pipeline", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("link", { name: "Pipeline", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
});

test.describe("dashboard access gate — denied", () => {
  test.use({ storageState: DOC_NOEXPORT_STORAGE_STATE_PATH });

  test("user without dashboard.ver is redirected to /", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/$/);
  });
});
