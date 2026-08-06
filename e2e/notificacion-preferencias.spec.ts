import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

const TOGGLE_LABEL = "Recibir el resumen diario por correo";

/**
 * Digest opt-out persistence (slice 13).
 *
 * The assertion that matters is the one AFTER a reload, not the one after the
 * click — this suite's standing rule, and doubly true here: the toggle is
 * client state, so asserting straight after saving would only re-read what
 * the browser already had and would pass even against a write that never
 * reached Postgres.
 *
 * There is a second reason a reload is not optional. The action's write path
 * is update-first / insert-fallback, because a column-limited UPDATE grant
 * makes `.upsert()` fail with 403 on this table. The admin fixture starts
 * with NO row, so the first save exercises the insert branch and the second
 * exercises the update branch. Both are covered here, in that order, and
 * that ordering is the point — not incidental.
 *
 * The single test restores the original opted-in state before it ends, so it
 * leaves no residue for other specs. It is one test rather than two precisely
 * so a retry cannot start from a state its first half created.
 */
test.describe("preferencias de notificación", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

  test("the Preferencias entry opens the page from the user menu", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "E2E Admin", exact: true }).click();
    await page.getByRole("menuitem", { name: "Preferencias" }).click();

    await expect(page).toHaveURL(/\/preferencias$/);
    await expect(page.getByLabel(TOGGLE_LABEL)).toBeVisible();
  });

  test("opting out persists across a reload, and opting back in does too", async ({
    page,
  }) => {
    await page.goto("/preferencias");

    // Default with no row is opted IN (spec DG3).
    await expect(page.getByLabel(TOGGLE_LABEL)).toBeChecked();

    // Opt OUT — first save, exercises the INSERT branch.
    await page.getByLabel(TOGGLE_LABEL).uncheck();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Preferencias guardadas.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(TOGGLE_LABEL)).not.toBeChecked();

    // Opt back IN — second save, exercises the UPDATE branch, and restores
    // the fixture to the state every other spec expects to find it in.
    await page.getByLabel(TOGGLE_LABEL).check();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Preferencias guardadas.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(TOGGLE_LABEL)).toBeChecked();
  });
});
