import { test, expect } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DASHBOARD_NOCRM_STORAGE_STATE_PATH,
} from "./env";

/**
 * Spec dashboard-actividad smoke (task 3.7): the Actividad face renders its
 * feed and charts for a `crm.ver` holder, and shows the empty-state shape
 * (zeros/empty, not an error) for a `dashboard.ver` holder who lacks
 * `crm.ver` — reuses the same `e2e-dashboard-nocrm` fixture PR-2 already
 * provisioned (`e2e/global-setup.ts`, `e2e/env.ts`), no new fixture needed.
 */
test.describe("dashboard actividad face", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("renders the feed and charts", async ({ page }) => {
    await page.goto("/dashboard/actividad");

    await expect(page.getByText("Nuevos contactos")).toBeVisible();
    await expect(page.getByText("Nuevas oportunidades")).toBeVisible();
    await expect(page.getByText("Actividad por semana")).toBeVisible();
    await expect(page.getByText("Clientes más activos")).toBeVisible();
    await expect(page.getByText("Actividad reciente")).toBeVisible();
  });

  test("the Actividad tab navigates from the dashboard shell", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Actividad clientes" }).click();
    await expect(page).toHaveURL(/\/dashboard\/actividad$/);
  });
});

test.describe("dashboard actividad face — no crm.ver", () => {
  test.use({ storageState: DASHBOARD_NOCRM_STORAGE_STATE_PATH });

  test("shows zeros and empty states, never an error", async ({ page }) => {
    await page.goto("/dashboard/actividad");
    await expect(page).toHaveURL(/\/dashboard\/actividad$/);

    await expect(page.getByText("Nuevos contactos")).toBeVisible();
    await expect(
      page.getByText("No hay datos para mostrar.").first(),
    ).toBeVisible();
  });
});
