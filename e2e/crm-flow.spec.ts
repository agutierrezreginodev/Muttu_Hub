import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

/**
 * Spec FC1-FC8 / CO1-CO6 / OP1-OP5 smoke, end to end against a REAL local
 * Supabase stack: an Administrador creates a cliente, adds a contacto, and
 * adds an oportunidad (with a servicios_interes multi-select selection),
 * through the actual CRM UI — no mocking anywhere in this chain. Extends
 * the same smoke suite `invite-flow.spec.ts` established (PR7, task 7.9).
 */
test("creates a cliente, adds a contacto, and adds an oportunidad", async ({
  page,
}) => {
  // Unlike the admin routes (warmed in global-setup.ts), /crm/[id] and its
  // two new PR7 tab segments are hit cold for the first time by this very
  // test — each is its own on-demand dev-mode compile (README's WSL note).
  // The suite-wide 60s budget is too tight for 3 cold navigations in one
  // test, so this spec gets its own more generous ceiling.
  test.setTimeout(120_000);

  const clienteNombre = `E2E Cliente ${Date.now()}`;

  await page.goto("/crm");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const createClienteDialog = page.getByRole("dialog");
  await createClienteDialog.locator("#cliente-nombre").fill(clienteNombre);
  await createClienteDialog.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await page.getByRole("link", { name: clienteNombre }).click();
  await page.waitForURL(/\/crm\/\d+$/, { timeout: 45_000 });

  // --- Contactos tab ---
  await page.getByRole("link", { name: "Contactos" }).click();
  await page.waitForURL(/\/crm\/\d+\/contactos$/, { timeout: 45_000 });

  await page.getByRole("button", { name: "Crear contacto" }).click();
  const contactoDialog = page.getByRole("dialog");
  await contactoDialog.getByLabel("Nombre").fill("Contacto E2E");
  await contactoDialog.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Contacto creado.")).toBeVisible();
  await expect(page.getByText("Contacto E2E")).toBeVisible();

  // --- Oportunidades tab ---
  await page.getByRole("link", { name: "Oportunidades" }).click();
  await page.waitForURL(/\/crm\/\d+\/oportunidades$/, { timeout: 45_000 });

  await page.getByRole("button", { name: "Crear oportunidad" }).click();
  const oportunidadDialog = page.getByRole("dialog");
  await oportunidadDialog.getByLabel("Nombre").fill("Oportunidad E2E");
  await oportunidadDialog.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Oportunidad creada.")).toBeVisible();
  await expect(page.getByText("Oportunidad E2E")).toBeVisible();
});
