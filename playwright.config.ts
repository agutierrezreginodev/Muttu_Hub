import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite (spec T3, task 5.1): invite flow, unauthenticated
 * redirect, idle logout with a short test-only timeout.
 *
 * Runs against a REAL local Supabase stack (`supabase start`) — no mocking.
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (never a committed
 * .env.local — see README "E2E tests" section). Locally, export them
 * inline from `supabase status -o env`; in CI they come from the job's own
 * `supabase start` output, never repository secrets (see
 * .github/workflows/ci.yml's `e2e` job).
 *
 * Two Next.js dev servers run side by side on different ports so the idle
 * logout test can use a short, test-only NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES
 * without racing the other specs, which need the real default (480min) to
 * never fire mid-test. Auth cookies are host-scoped, not port-scoped, so a
 * single storageState (from global-setup.ts) works against both.
 */
const APP_PORT = 3000;
const IDLE_APP_PORT = 3010;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const IDLE_APP_URL = `http://127.0.0.1:${IDLE_APP_PORT}`;

/** Short enough to observe deterministically in a test, long enough that
 * filling in a form doesn't trip it by accident (activity events reset the
 * timer on every keystroke/click). */
const IDLE_TEST_TIMEOUT_MINUTES = "0.1"; // 6 seconds

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  // Generous per-test budget: dev mode compiles each route on-demand on
  // first hit (WSL /mnt/c filesystem, see README's WSL note), and
  // invite-flow.spec.ts chains two real page navigations plus a real
  // Mailpit round-trip on top of that.
  timeout: 60_000,
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "**/idle-logout.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "idle-logout",
      testMatch: "**/idle-logout.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: IDLE_APP_URL },
    },
  ],
  webServer: [
    {
      command: `pnpm exec next dev -p ${APP_PORT}`,
      url: `${APP_URL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env } as Record<string, string>,
    },
    {
      command: `pnpm exec next dev -p ${IDLE_APP_PORT}`,
      url: `${IDLE_APP_URL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES: IDLE_TEST_TIMEOUT_MINUTES,
      } as Record<string, string>,
    },
  ],
});
