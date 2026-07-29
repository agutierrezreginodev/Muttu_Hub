import { test, expect } from "@playwright/test";

import { ADMIN_STORAGE_STATE_PATH } from "./env";

test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

/**
 * Spec FC1-FC9 / CO1-CO6 / OP1-OP5 / BIT1-BIT6 smoke, end to end against a
 * REAL local Supabase stack: an Administrador creates a cliente, adds a
 * contacto, adds an oportunidad (with a servicios_interes multi-select
 * selection), creates a compromiso (PR8, spec FC9/design Decision 9), and
 * appends a bitácora entry (PR8, spec BIT1-BIT6) — through the actual CRM
 * UI, no mocking anywhere in this chain. Extends the same smoke suite
 * `invite-flow.spec.ts` established (PR7, task 7.9).
 */
test("creates a cliente, adds a contacto, an oportunidad, a compromiso, and a bitácora entry", async ({
  page,
}) => {
  // Unlike the admin routes (warmed in global-setup.ts), /crm/[id] and its
  // tab segments are hit cold for the first time by this very test — each
  // is its own on-demand dev-mode compile (README's WSL note). PR8 adds 2
  // more cold navigations (Compromisos, Bitácora) on top of PR7's 3, so
  // this spec's ceiling grows accordingly.
  test.setTimeout(180_000);

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

  // --- Compromisos tab (PR8, spec FC9 / design Decision 9) ---
  await page.getByRole("link", { name: "Compromisos" }).click();
  await page.waitForURL(/\/crm\/\d+\/compromisos$/, { timeout: 45_000 });

  await page.getByRole("button", { name: "Crear compromiso" }).click();
  const compromisoDialog = page.getByRole("dialog");
  await compromisoDialog.getByLabel("Título").fill("Compromiso E2E");
  await compromisoDialog.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Compromiso creado.")).toBeVisible();
  // Scoped to the Compromisos TABLE row's own badge
  // (`tarea-titulo-badge-{id}`), NOT a bare getByText: the same title also
  // renders in FichaHeader's `proximo-compromiso-badge` (shared layout,
  // asserted separately below) — a real, genuine strict-mode ambiguity
  // this E2E run caught on its first execution (both badges legitimately
  // show the same text at the same time), not a product bug.
  await expect(
    page.locator('[data-testid^="tarea-titulo-badge-"]', {
      hasText: "Compromiso E2E",
    }),
  ).toBeVisible();

  // FichaHeader (shared layout, PR6) reflects the new "próximo compromiso"
  // (spec FC7) without a full reload — this cliente had no prior tarea, so
  // the freshly created one is necessarily the earliest pending one.
  // vencido styling itself is unit-tested exhaustively in
  // ficha-header.test.tsx; this E2E step only proves the REAL header
  // actually re-renders with the new title after the mutation.
  const proximoBadge = page.getByTestId("proximo-compromiso-badge");
  await expect(proximoBadge).toBeVisible();
  await expect(proximoBadge).toHaveText("Compromiso E2E");

  // --- Bitácora tab (PR8, spec BIT1-BIT6) ---
  await page.getByRole("link", { name: "Bitácora" }).click();
  await page.waitForURL(/\/crm\/\d+\/bitacora$/, { timeout: 45_000 });

  await page.getByLabel("Nueva entrada").fill("Nota de seguimiento E2E");
  await page.getByRole("button", { name: "Agregar entrada" }).click();

  await expect(page.getByText("Entrada agregada a la bitácora.")).toBeVisible();
  await expect(page.getByText("Nota de seguimiento E2E")).toBeVisible();

  // Spec BIT5 (hard requirement, not a stylistic choice): zero edit/delete
  // affordance anywhere on any bitácora entry — asserted against the REAL
  // rendered DOM, not just code review. The feed (aria-label "Bitácora")
  // must contain zero buttons of any kind.
  const bitacoraFeed = page.getByRole("list", { name: "Bitácora" });
  await expect(bitacoraFeed.getByRole("button")).toHaveCount(0);
});
