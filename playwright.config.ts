import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite (spec T3, task 5.1): invite flow, unauthenticated
 * redirect, idle logout, CRM, documentos and dashboard.
 *
 * Runs against a REAL local Supabase stack (`supabase start`) — no mocking.
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (never a committed
 * .env.local — see README "E2E tests" section). Locally, export them
 * inline from `supabase status -o env`; in CI they come from the job's own
 * `supabase start` output, never repository secrets (see
 * .github/workflows/ci.yml's `e2e` job).
 *
 * RUNS AGAINST A PRODUCTION BUILD (`next start`), so **`pnpm build` must run
 * first** — CI has a dedicated step for it. This replaced `next dev`, and the
 * reason is measured, not stylistic: dev mode compiles every route on first
 * request, which made the suite take ~20 minutes for 8 tests and fail on
 * compile latency instead of on real defects (detached elements mid-Fast-Refresh,
 * `element(s) not found` for markup that was plainly in the source). A
 * production build serves precompiled routes, and it has no Fast Refresh to
 * reload a page out from under an in-flight click.
 *
 * ONE server, not two. The previous setup ran a second dev server purely so
 * `idle-logout.spec.ts` could get a short `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES`.
 * That trick cannot survive a production build — `NEXT_PUBLIC_*` is inlined at
 * BUILD time, so two `next start` instances sharing one build cannot disagree
 * on it. That spec now fast-forwards Playwright's clock instead, which needs no
 * second server, no second build, and no test-only product configuration.
 */
const APP_PORT = 3000;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  // Kept generous even against a production build: invite-flow.spec.ts chains
  // two real page navigations plus a real Mailpit round-trip, and documentos
  // uploads and zips real files.
  timeout: 60_000,
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${APP_PORT}`,
    url: `${APP_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env } as Record<string, string>,
  },
});
