/**
 * Shared environment for the E2E suite. Mirrors the exact vars `pnpm dev`
 * and the app itself need — see README "E2E tests": never a committed
 * .env.local, always exported inline (locally from `supabase status -o
 * env`; in CI from that job's own fresh `supabase start`).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name} for the E2E suite. Export it ` +
        `inline before running Playwright (see README "E2E tests") — ` +
        `never write it to .env.local.`,
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
);
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const APP_URL = "http://127.0.0.1:3000";
export const IDLE_APP_URL = "http://127.0.0.1:3010";

export const E2E_ADMIN_EMAIL = "e2e-admin@muttu-hub.test";
export const E2E_ADMIN_PASSWORD = "E2eAdminPass123";
export const ADMIN_STORAGE_STATE_PATH = "e2e/.auth/admin.json";
