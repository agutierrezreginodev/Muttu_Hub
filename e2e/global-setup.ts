import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL,
  IDLE_APP_URL,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  ADMIN_STORAGE_STATE_PATH,
} from "./env";

/**
 * Next.js dev mode compiles each route on-demand, on first request — 10s+
 * per route on this repo's WSL /mnt/c filesystem (see README's WSL note).
 * A cold first hit racing an interactive Playwright flow is flaky
 * (fast-refresh reload mid-navigation can drop a just-set cookie). Warming
 * every route BOTH webServer instances will serve, before any real
 * interaction, is what removes that flakiness — this is not masking a
 * product bug, it is dev-server compile latency.
 */
async function warmUpRoute(url: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch {
    // Best-effort warm-up; a real failure will surface again (and fail
    // loudly) when Playwright itself navigates there.
  }
}

/**
 * Runs once before the whole suite. Provisions a real Administrador user
 * directly via the service-role Admin API (`createUser` + `email_confirm`,
 * bypassing the invite-email round trip on purpose): that round trip is
 * exactly what invite-flow.spec.ts tests for a SECOND user through the
 * real admin UI. This fixture only needs an authenticated admin session to
 * get there, so it takes the fast, direct path — same idempotency pattern
 * as scripts/bootstrap-admin.ts (safe to re-run against a DB that already
 * has this fixture user).
 *
 * Logs in through the real /login form (not a cookie hand-roll) and saves
 * the resulting session so every other spec can reuse it.
 */
export default async function globalSetup(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rol, error: rolError } = await supabase
    .from("rol")
    .select("id")
    .eq("nombre", "Administrador")
    .single();

  if (rolError || !rol) {
    throw new Error(
      `E2E global-setup: could not find the Administrador role — has ` +
        `supabase/seed.sql been applied (supabase start / supabase db ` +
        `reset)? ${rolError?.message ?? ""}`,
    );
  }

  const { data: existingUsuario } = await supabase
    .from("usuario")
    .select("id")
    .eq("email", E2E_ADMIN_EMAIL)
    .maybeSingle();

  if (!existingUsuario) {
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: E2E_ADMIN_EMAIL,
        password: E2E_ADMIN_PASSWORD,
        email_confirm: true,
      });

    if (createError || !created?.user) {
      throw new Error(
        `E2E global-setup: failed to create the admin fixture user: ` +
          `${createError?.message ?? "unknown error"}`,
      );
    }

    const { error: insertError } = await supabase.from("usuario").insert({
      id: created.user.id,
      nombre: "E2E Admin",
      email: E2E_ADMIN_EMAIL,
      rol_id: rol.id,
    });

    if (insertError) {
      throw new Error(
        `E2E global-setup: admin auth user created but usuario insert ` +
          `failed: ${insertError.message}`,
      );
    }
  }

  await Promise.all(
    [
      `${APP_URL}/login`,
      `${APP_URL}/`,
      `${APP_URL}/admin/usuarios`,
      `${APP_URL}/auth/callback`,
      `${APP_URL}/actualizar-clave`,
      `${IDLE_APP_URL}/login`,
      `${IDLE_APP_URL}/`,
    ].map(warmUpRoute),
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: APP_URL });

  await page.goto(`${APP_URL}/login`);
  await page.fill("#email", E2E_ADMIN_EMAIL);
  await page.fill("#password", E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 15_000 });

  await page.context().storageState({ path: ADMIN_STORAGE_STATE_PATH });
  await browser.close();
}
