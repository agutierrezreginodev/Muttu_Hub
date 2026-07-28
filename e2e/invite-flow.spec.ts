import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH, APP_URL } from "./env";
import { waitForVerifyLink } from "./utils/mailpit";

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

/**
 * Spec U8 / T3 smoke, end to end against a REAL local Supabase stack: an
 * Administrador invites a new user through the actual admin UI, a real
 * invite email round-trips through Mailpit, and the invitee sets their own
 * password and lands home — no mocking anywhere in this chain.
 *
 * This test is exactly what proved (and, in the process of building it,
 * DISPROVED then re-proved after a fix) that the invite flow's
 * `/auth/callback` step actually works — see that route's doc comment and
 * Engram sdd/platform-foundation/apply-progress (PR5 section) for the full
 * story of the bug this test caught.
 */
test("admin invites a user; invitee sets a password and lands home", async ({
  page,
  browser,
}) => {
  const email = `e2e-invitee-${Date.now()}@example.com`;
  const sinceIso = new Date().toISOString();

  await page.goto("/admin/usuarios");

  await page.getByRole("button", { name: "Invitar usuario" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator("#invite-nombre").fill("Invitado E2E");
  await dialog.locator("#invite-email").fill(email);
  await dialog.locator("#invite-rol").click();
  await page.getByRole("option", { name: "Colaborador" }).click();
  await dialog.getByRole("button", { name: "Invitar usuario" }).click();

  await expect(page.getByText("Invitación enviada.")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const verifyLink = await waitForVerifyLink(email, sinceIso);

  // A brand-new, unauthenticated context: the invitee never shares the
  // admin's session.
  const inviteeContext = await browser.newContext({ baseURL: APP_URL });
  const inviteePage = await inviteeContext.newPage();

  await inviteePage.goto(verifyLink);
  await inviteePage.waitForURL(/\/actualizar-clave$/, { timeout: 10_000 });

  await inviteePage.fill("#password", "Passw0rd123");
  await inviteePage.fill("#confirmPassword", "Passw0rd123");
  await inviteePage
    .getByRole("button", { name: "Actualizar contraseña" })
    .click();

  await inviteePage.waitForURL(`${APP_URL}/`, { timeout: 10_000 });
  await expect(inviteePage.getByText("Bienvenido a Muttu Hub.")).toBeVisible();

  await inviteeContext.close();
});
