import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

/**
 * Far past any plausible `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` (the shipped
 * default is 480 minutes / 8h). Fast-forwarding does not sleep — Playwright
 * jumps the page's clock and fires whatever timers that window scheduled — so
 * an oversized jump costs nothing and keeps this test passing if the product
 * default is ever lowered.
 */
const WELL_PAST_IDLE_TIMEOUT = "24:00:00";

/**
 * Spec A4 / T3 smoke: idle auto-logout.
 *
 * `useIdleLogout` arms a single `setTimeout(handleIdle, IDLE_TIMEOUT_MS)` and
 * resets it on mousedown/keydown/scroll/touchstart. This test installs
 * Playwright's clock and fast-forwards past that timer instead of waiting out
 * real time, then asserts the hook signed out and redirected.
 *
 * WHY THE CLOCK, and not a shorter configured timeout: this used to run against
 * a SECOND dev server started with a test-only
 * `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=0.1`. The suite now runs against a
 * production build, and `NEXT_PUBLIC_*` values are inlined at BUILD time — two
 * `next start` instances sharing one build cannot disagree on that variable, so
 * the old trick is structurally impossible. Driving the clock is better anyway:
 * it exercises the REAL shipped timeout rather than a test-only value, needs no
 * extra server, and cannot flake on a 6-second timer racing a slow page load
 * (which is exactly how this spec failed the first time it ever ran in CI).
 *
 * `clock.install()` must precede navigation so the page's timers are mocked
 * from the moment the hook mounts. No activity event is dispatched after
 * loading, so the timer is left to elapse untouched.
 */
test("idle session times out and redirects to /login", async ({ page }) => {
  await page.clock.install();

  await page.goto("/");
  await expect(page.getByText("Bienvenido a Muttu Hub.")).toBeVisible();

  await page.clock.fastForward(WELL_PAST_IDLE_TIMEOUT);

  // `handleIdle` awaits a real supabase.auth.signOut() round trip before
  // `window.location.assign("/login")`, so allow for that: the clock is mocked,
  // the network is not.
  await page.waitForURL(/\/login$/, { timeout: 20_000 });
});
