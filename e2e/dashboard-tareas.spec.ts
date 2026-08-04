import { test, expect } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DASHBOARD_NOCRM_STORAGE_STATE_PATH,
} from "./env";

/**
 * Spec dashboard-tareas smoke (task 4.7): the Tareas face renders its
 * charts/tiles for a `dashboard.ver` holder with domain visibility, and
 * shows the empty-state shape (zeros/empty, not an error) for a viewer who
 * lacks BOTH `crm.ver` and `kanban.ver` — the `e2e-dashboard-nocrm` fixture
 * PR-2 already provisioned denies BOTH modules (`e2e/global-setup.ts`), so
 * it is EXACTLY the spec's "lacks both crm.ver and kanban.ver" scenario —
 * no new fixture needed, same reuse PR-3 already established for Actividad.
 */
test.describe("dashboard tareas face", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("renders the overdue tile and charts", async ({ page }) => {
    await page.goto("/dashboard/tareas");

    await expect(page.getByText("Tareas vencidas")).toBeVisible();
    await expect(page.getByText("Tareas por estado")).toBeVisible();
    await expect(page.getByText("Tareas completadas por semana")).toBeVisible();
    await expect(
      page.getByText("Tareas abiertas por responsable"),
    ).toBeVisible();
  });

  test("the Tareas tab navigates from the dashboard shell", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Tareas", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/tareas$/);
  });
});

test.describe("dashboard tareas face — no crm.ver or kanban.ver", () => {
  test.use({ storageState: DASHBOARD_NOCRM_STORAGE_STATE_PATH });

  test("shows zeros and empty states, never an error", async ({ page }) => {
    await page.goto("/dashboard/tareas");
    await expect(page).toHaveURL(/\/dashboard\/tareas$/);

    await expect(page.getByText("Tareas vencidas")).toBeVisible();
    await expect(
      page.getByText("No hay datos para mostrar.").first(),
    ).toBeVisible();
  });
});
