import { test, expect } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DASHBOARD_NOCRM_STORAGE_STATE_PATH,
} from "./env";

/**
 * Spec dashboard-pipeline smoke (task 2.9): the Pipeline face renders its
 * KPIs and charts for a `crm.ver` holder, and shows the empty-state shape
 * (zeros, not an error) for a `dashboard.ver` holder who lacks `crm.ver`
 * (`e2e-dashboard-nocrm` fixture, `global-setup.ts`).
 */
test.describe("dashboard pipeline face", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("renders KPI tiles and charts", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText("Oportunidades abiertas")).toBeVisible();
    await expect(page.getByText("Valor total abierto")).toBeVisible();
    await expect(page.getByText("Conversión")).toBeVisible();
    await expect(page.getByText("Pendiente de clasificación")).toBeVisible();
    await expect(page.getByText("Oportunidades por estado")).toBeVisible();
    await expect(page.getByText("Valor por estado (COP)")).toBeVisible();
  });
});

test.describe("dashboard pipeline face — no crm.ver", () => {
  test.use({ storageState: DASHBOARD_NOCRM_STORAGE_STATE_PATH });

  test("shows zeros and chart empty states, never an error", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByText("Oportunidades abiertas")).toBeVisible();
    // KPI tile shows the numeral 0, not a thrown error page.
    await expect(page.getByText("Oportunidades por estado")).toBeVisible();
    await expect(
      page.getByText("No hay datos para mostrar.").first(),
    ).toBeVisible();
  });
});
