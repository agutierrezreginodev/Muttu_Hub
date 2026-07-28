import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

/**
 * Spec A4 / T3 smoke: idle auto-logout. Runs against a SEPARATE Next.js
 * dev server (port 3010, see playwright.config.ts's "idle-logout" project)
 * configured with a short, test-only NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES so
 * this test doesn't have to wait out the real 480-minute default. Auth
 * cookies are host-scoped, not port-scoped, so the shared admin
 * storageState works here too.
 *
 * No user-activity events are dispatched after the initial navigation —
 * useIdleLogout's timer is intentionally left to elapse untouched.
 */
test("idle session times out and redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Bienvenido a Muttu Hub.")).toBeVisible();

  // Configured timeout is 0.1min (6s); give real margin for CI jitter
  // without dispatching any activity event ourselves.
  await page.waitForURL(/\/login$/, { timeout: 20_000 });
});
