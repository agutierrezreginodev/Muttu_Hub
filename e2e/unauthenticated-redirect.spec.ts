import { test, expect } from "@playwright/test";

/**
 * Spec A5 / T3 smoke: every route requires a session; visiting one while
 * signed out redirects to /login. No storageState is configured for this
 * spec, so each test starts with a clean, unauthenticated browser context.
 *
 * The public paths are asserted here too, and not only the gated ones: a
 * recovery page that redirects to /login is unusable for the only people who
 * ever need it, and a passing "everything redirects" suite is exactly what
 * hid that from view.
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

  test("recuperar stays reachable without a session", async ({ page }) => {
    await page.goto("/recuperar");

    await expect(page).toHaveURL(/\/recuperar$/);
    await expect(
      page.getByRole("button", { name: "Enviar enlace" }),
    ).toBeVisible();
  });
});
