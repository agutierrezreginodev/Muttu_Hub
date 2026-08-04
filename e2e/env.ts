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

export const E2E_ADMIN_EMAIL = "e2e-admin@muttu-hub.test";
export const E2E_ADMIN_PASSWORD = "E2eAdminPass123";
export const ADMIN_STORAGE_STATE_PATH = "e2e/.auth/admin.json";

/**
 * A user of its OWN, used by nothing but `idle-logout.spec.ts`.
 *
 * That spec drives `useIdleLogout` to completion, and the hook calls
 * `supabase.auth.signOut()`. Supabase's default sign-out scope is GLOBAL: it
 * revokes EVERY session belonging to that user, not just the current one. So if
 * the spec shared the admin fixture it would destroy the admin session mid-suite
 * and every later spec reusing `ADMIN_STORAGE_STATE_PATH` would be bounced to
 * /login. That is not hypothetical — it is exactly what happened the moment the
 * suite stopped running idle-logout in a separate, last-executing Playwright
 * project: `invite-flow.spec.ts`, the only session-dependent spec that sorts
 * after `idle-logout`, started failing on a button that renders unconditionally.
 *
 * A dedicated user REMOVES that ordering invariant rather than relying on it.
 * Any role works; the spec only loads `/` and waits to be signed out.
 */
export const E2E_IDLE_EMAIL = "e2e-idle@muttu-hub.test";
export const E2E_IDLE_PASSWORD = "E2eIdlePass123";
export const IDLE_STORAGE_STATE_PATH = "e2e/.auth/idle.json";

/**
 * Documentos fixtures (task 8.1). Three sessions are needed because the
 * documentos gate is three ORTHOGONAL axes and each user isolates one of them:
 *
 * - the admin above: category granted + `documentos.exportar` → the full flow;
 * - `E2E_DOC_DENIED_*`: `documentos.ver` but NO category grant → proves the
 *   CATEGORY axis denies on its own, not the module verb;
 * - `E2E_DOC_NOEXPORT_*`: category granted but `exportar` false → proves the
 *   zip capability is gated separately from being able to read the documents.
 */
export const E2E_DOC_DENIED_EMAIL = "e2e-doc-denied@muttu-hub.test";
export const E2E_DOC_DENIED_PASSWORD = "E2eDocDeniedPass123";
export const DOC_DENIED_STORAGE_STATE_PATH = "e2e/.auth/doc-denied.json";

export const E2E_DOC_NOEXPORT_EMAIL = "e2e-doc-noexport@muttu-hub.test";
export const E2E_DOC_NOEXPORT_PASSWORD = "E2eDocNoExportPass123";
export const DOC_NOEXPORT_STORAGE_STATE_PATH = "e2e/.auth/doc-noexport.json";

/** Catalog code the documentos fixtures grant. The real catalog ships empty (design Decision 8). */
export const E2E_DOC_CATEGORIA = "e2e_general";
export const E2E_DOC_CATEGORIA_ETIQUETA = "E2E General";

/** Role provisioned for the no-export case: reads documentos, cannot bulk-export. */
export const E2E_DOC_NOEXPORT_ROLE = "E2E Documentos Lector";

/**
 * Dashboard fixture (task 2.9, spec dashboard-pipeline "dashboard.ver but
 * no crm.ver sees zeros, not an error"). None of the 4 seeded roles hold
 * this exact combination (every role with `dashboard.ver=true` also has
 * `crm.ver=true`), so a dedicated role isolates the scenario.
 */
export const E2E_DASHBOARD_NOCRM_EMAIL = "e2e-dashboard-nocrm@muttu-hub.test";
export const E2E_DASHBOARD_NOCRM_PASSWORD = "E2eDashboardNoCrmPass123";
export const DASHBOARD_NOCRM_STORAGE_STATE_PATH =
  "e2e/.auth/dashboard-nocrm.json";
export const E2E_DASHBOARD_NOCRM_ROLE = "E2E Dashboard Sin CRM";
