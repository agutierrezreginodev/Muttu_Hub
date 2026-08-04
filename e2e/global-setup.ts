import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_URL,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  ADMIN_STORAGE_STATE_PATH,
  E2E_DOC_DENIED_EMAIL,
  E2E_DOC_DENIED_PASSWORD,
  DOC_DENIED_STORAGE_STATE_PATH,
  E2E_DOC_NOEXPORT_EMAIL,
  E2E_DOC_NOEXPORT_PASSWORD,
  DOC_NOEXPORT_STORAGE_STATE_PATH,
  E2E_IDLE_EMAIL,
  E2E_IDLE_PASSWORD,
  IDLE_STORAGE_STATE_PATH,
} from "./env";
import { setUpDocumentosFixtures } from "./utils/documentos-fixtures";

/**
 * Next.js dev mode compiles each route on-demand, on first request — 10s+
 * per route on this repo's WSL /mnt/c filesystem (see README's WSL note).
 * A cold first hit racing an interactive Playwright flow is flaky
 * (fast-refresh reload mid-navigation can drop a just-set cookie). Warming
 * routes before any real interaction is what removes that flakiness — this is
 * not masking a product bug, it is dev-server compile latency.
 *
 * CI does not need this: it runs against `next start`, where every route is
 * already compiled, and the warm-up costs a handful of fast requests. It stays
 * for the LOCAL path, which does still hit dev mode — `playwright.config.ts`
 * sets `reuseExistingServer: !process.env.CI`, so a developer with `pnpm dev`
 * already running on port 3000 has the suite reuse that dev server.
 *
 * IMPORTANT LIMITATION, and the reason this is called twice below: an
 * unauthenticated request can only ever warm a PUBLIC route. Every gated route
 * (`/`, `/crm/*`, `/admin/*`, `/dashboard/*`) is redirected to `/login` by the
 * middleware before its page module is ever invoked, so dev mode compiles
 * nothing for it. A cookie-less pass over the gated list is therefore a no-op
 * for exactly the routes that are slowest to compile. `warmUpAuthenticated`
 * runs the same list again once a real session exists.
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

  // Idle fixture: a user nothing else touches, because idle-logout's signOut()
  // revokes EVERY session of whoever it runs as (see e2e/env.ts). Same
  // idempotent lookup-then-create posture as every other fixture here.
  const { data: existingIdleUsuario } = await supabase
    .from("usuario")
    .select("id")
    .eq("email", E2E_IDLE_EMAIL)
    .maybeSingle();

  if (!existingIdleUsuario) {
    const { data: createdIdle, error: createIdleError } =
      await supabase.auth.admin.createUser({
        email: E2E_IDLE_EMAIL,
        password: E2E_IDLE_PASSWORD,
        email_confirm: true,
      });

    if (createIdleError || !createdIdle?.user) {
      throw new Error(
        `E2E global-setup: failed to create the idle fixture user: ` +
          `${createIdleError?.message ?? "unknown error"}`,
      );
    }

    const { error: insertIdleError } = await supabase.from("usuario").insert({
      id: createdIdle.user.id,
      nombre: "E2E Idle",
      email: E2E_IDLE_EMAIL,
      rol_id: rol.id,
    });

    if (insertIdleError) {
      throw new Error(
        `E2E global-setup: idle auth user created but usuario insert ` +
          `failed: ${insertIdleError.message}`,
      );
    }
  }

  // Documentos fixtures (PR8, task 8.1): category code, grants, and the two
  // extra users that isolate the category axis and the exportar verb.
  await setUpDocumentosFixtures(supabase, rol.id);

  const routesToWarm = [
    `${APP_URL}/login`,
    `${APP_URL}/`,
    `${APP_URL}/admin/usuarios`,
    `${APP_URL}/auth/callback`,
    `${APP_URL}/actualizar-clave`,
    // PR7 flagged this gap: no /crm/* route was warmed, so crm-flow.spec.ts
    // paid the FULL cold-compile cost for every one of its own tab
    // segments. Next.js dev mode compiles per ROUTE FILE, not per param
    // value, so hitting `/crm/1/*` here (a placeholder id, response status
    // ignored) still warms the `/crm/[id]/*` bundles PR6-PR8 shipped,
    // ahead of the real interactive navigation.
    `${APP_URL}/crm`,
    `${APP_URL}/crm/1`,
    `${APP_URL}/crm/1/contactos`,
    `${APP_URL}/crm/1/oportunidades`,
    `${APP_URL}/crm/1/compromisos`,
    `${APP_URL}/crm/1/bitacora`,
    `${APP_URL}/crm/1/tareas`,
    // PR8: the documentos tab and its Route Handlers, plus the admin
    // category-grant screen (PR7). Same reasoning as the /crm/1/* entries —
    // dev mode compiles per route FILE, so a placeholder id warms the bundle.
    `${APP_URL}/crm/1/documentos`,
    `${APP_URL}/admin/documentos`,
  ];

  // Pass 1 — cookie-less. Warms the public routes only (see warmUpRoute).
  await Promise.all(routesToWarm.map(warmUpRoute));

  const browser = await chromium.launch();

  /**
   * Pass 2 — the same list, replayed with a real session's cookies so the
   * GATED routes finally compile. `context.request` inherits the context's
   * cookies, which is what makes this pass different from the cookie-less one.
   */
  async function warmUpAuthenticated(storageStatePath: string): Promise<void> {
    const context = await browser.newContext({
      storageState: storageStatePath,
      baseURL: APP_URL,
    });

    try {
      await Promise.all(
        routesToWarm.map((url) =>
          context.request.get(url, { timeout: 60_000 }).catch(() => undefined),
        ),
      );
    } finally {
      await context.close();
    }
  }

  /**
   * One saved session per fixture user. Each is a REAL /login round trip
   * rather than a hand-rolled cookie, so the stored state is whatever the app
   * itself issues.
   *
   * RETRIED ON PURPOSE. `loginAction` ends in `redirect("/")`, and `/` is a
   * gated route the cookie-less pass above could not compile — so the FIRST
   * login is what pays its cold-compile cost. While that compile runs, dev mode
   * can emit a Fast Refresh full reload that re-navigates `/login` and discards
   * the in-flight form submission, parking the page on `/login` forever. That
   * is a dev-server race, not a product failure, and nothing will re-submit the
   * form on its own — so submitting again is the only sound response.
   *
   * This is the exact failure that made the `e2e` job red the first time it
   * ever ran: `page.waitForURL` timed out at 15s against a cold `/`.
   */
  const LOGIN_ATTEMPTS = 3;
  const LOGIN_NAVIGATION_TIMEOUT_MS = 60_000;

  async function saveSession(
    email: string,
    password: string,
    path: string,
  ): Promise<void> {
    const page = await browser.newPage({ baseURL: APP_URL });

    try {
      for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt += 1) {
        await page.goto(`${APP_URL}/login`);
        await page.fill("#email", email);
        await page.fill("#password", password);
        await page.getByRole("button", { name: "Ingresar" }).click();

        try {
          await page.waitForURL(`${APP_URL}/`, {
            timeout: LOGIN_NAVIGATION_TIMEOUT_MS,
          });
          await page.context().storageState({ path });
          return;
        } catch (navigationError) {
          if (attempt < LOGIN_ATTEMPTS) continue;

          // Last attempt: surface whatever the form itself said, so a genuine
          // credential problem is never misreported as an infrastructure delay.
          const formError = await page
            .getByRole("alert")
            .first()
            .textContent()
            .catch(() => null);

          throw new Error(
            `E2E global-setup: ${email} never reached ${APP_URL}/ after ` +
              `${LOGIN_ATTEMPTS} login attempts (last URL: ${page.url()}). ` +
              (formError?.trim()
                ? `The login form reported: "${formError.trim()}" — check this ` +
                  `fixture user's credentials.`
                : `The form showed no error, so the submission never completed. ` +
                  `Against CI's production server there is no compile step left ` +
                  `to blame: suspect the login redirect or session handling, and ` +
                  `read the webServer output above. Only on a LOCAL dev server ` +
                  `(reuseExistingServer) is compile latency a plausible cause.`) +
              ` Underlying: ${(navigationError as Error).message}`,
          );
        }
      }
    } finally {
      await page.close();
    }
  }

  // The admin session goes first: it is the one that pays the cold `/` compile,
  // and it is what makes the authenticated warm-up below possible at all.
  await saveSession(
    E2E_ADMIN_EMAIL,
    E2E_ADMIN_PASSWORD,
    ADMIN_STORAGE_STATE_PATH,
  );

  // Now that a session exists, compile the gated routes for real — before any
  // spec navigates to them interactively.
  await warmUpAuthenticated(ADMIN_STORAGE_STATE_PATH);

  await saveSession(
    E2E_DOC_DENIED_EMAIL,
    E2E_DOC_DENIED_PASSWORD,
    DOC_DENIED_STORAGE_STATE_PATH,
  );
  await saveSession(
    E2E_DOC_NOEXPORT_EMAIL,
    E2E_DOC_NOEXPORT_PASSWORD,
    DOC_NOEXPORT_STORAGE_STATE_PATH,
  );
  // Last, and deliberately its own user: idle-logout signs this session out
  // globally, so it must not be a session any other spec depends on.
  await saveSession(E2E_IDLE_EMAIL, E2E_IDLE_PASSWORD, IDLE_STORAGE_STATE_PATH);

  await browser.close();
}
