import { test, expect } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DASHBOARD_NOCRM_STORAGE_STATE_PATH,
} from "./env";

/**
 * Mi resumen face smoke (PRD §7.2, the fourth face). Two things are worth
 * covering here that a unit test cannot reach:
 *
 * 1. The tab actually navigates. Until this PR the label existed in
 *    `es.dashboard.tabs` while `mi-resumen/page.tsx` did not, so the face was
 *    unreachable in the running app even though its views, queries and pure
 *    derivations were all built and covered. A dead tab is precisely the
 *    failure this asserts against.
 *
 * 2. The self-scoped reads degrade to zeros/empty rather than an error for a
 *    viewer without domain visibility. Reuses the `e2e-dashboard-nocrm`
 *    fixture that PR-2 provisioned (denies BOTH `crm.ver` and `kanban.ver`,
 *    see `e2e/global-setup.ts`) — same reuse Actividad and Tareas established,
 *    no new fixture needed.
 */
test.describe("dashboard mi resumen face", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("renders the personal headline tiles and the agenda section", async ({
    page,
  }) => {
    await page.goto("/dashboard/mi-resumen");

    await expect(page.getByText("Mis tareas abiertas")).toBeVisible();
    await expect(page.getByText("Vencen esta semana")).toBeVisible();
    await expect(page.getByText("Mis clientes asignados")).toBeVisible();
    await expect(page.getByText("Mis tareas por estado")).toBeVisible();
    await expect(page.getByText("Mis próximas fechas")).toBeVisible();
  });

  test("explains that the compromisos count is CRM-only", async ({ page }) => {
    await page.goto("/dashboard/mi-resumen");
    await expect(page.getByTestId("mi-resumen-ayuda")).toBeVisible();
  });

  test("the Mi resumen tab navigates from the dashboard shell", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Mi resumen", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/mi-resumen$/);
  });
});

test.describe("dashboard mi resumen face — no crm.ver or kanban.ver", () => {
  test.use({ storageState: DASHBOARD_NOCRM_STORAGE_STATE_PATH });

  test("shows zeros and empty states, never an error", async ({ page }) => {
    await page.goto("/dashboard/mi-resumen");
    await expect(page).toHaveURL(/\/dashboard\/mi-resumen$/);

    await expect(page.getByText("Mis tareas abiertas")).toBeVisible();
    // The personal empty state, deliberately NOT the generic "No hay datos
    // para mostrar" — for a personal view the accurate reading of zero is
    // reassurance, not a failure notice.
    await expect(page.getByTestId("mi-resumen-agenda-empty")).toBeVisible();
  });
});
