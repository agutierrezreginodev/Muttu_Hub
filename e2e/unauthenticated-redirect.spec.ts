import { test, expect } from "@playwright/test";

/**
 * Spec A5 / T3 smoke: every route requires a session; visiting one while
 * signed out redirects to /login. No storageState is configured for this
 * spec, so each test starts with a clean, unauthenticated browser context.
 */
test.describe("unauthenticated redirect", () => {
  test("home redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("admin redirects to /login", async ({ page }) => {
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/login$/);
  });
});
