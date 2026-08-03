import { test, expect, type Page } from "@playwright/test";

import {
  ADMIN_STORAGE_STATE_PATH,
  DOC_DENIED_STORAGE_STATE_PATH,
  DOC_NOEXPORT_STORAGE_STATE_PATH,
  E2E_DOC_CATEGORIA_ETIQUETA,
} from "./env";

/**
 * Spec document-library / document-versioning / document-permissions /
 * document-zip-export smoke (PR8, task 8.1), end to end against a REAL local
 * Supabase stack INCLUDING Storage — real multipart uploads, real objects, real
 * signed URLs, real zip bytes. No mocking anywhere in this chain.
 *
 * Three sessions, one per authorization axis (see `env.ts`): the admin runs the
 * full flow; `doc-denied` has `documentos.ver` but no grant on the category, so
 * any denial it hits is attributable to the CATEGORY axis alone; `doc-noexport`
 * is granted the category but lacks `documentos.exportar`, isolating the
 * bulk-export capability from the ability to read the same documents.
 *
 * The fixtures (`utils/documentos-fixtures.ts`) seed a `categoria_documento`
 * code and grant it, because the real catalog ships EMPTY (design Decision 8)
 * and `private.categoria_visible` has no administrator bypass — without an
 * explicit grant even the admin sees nothing.
 */

async function createCliente(page: Page, nombre: string): Promise<string> {
  await page.goto("/crm");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator("#cliente-nombre").fill(nombre);
  await dialog.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Cliente creado.")).toBeVisible();
  await page.getByRole("link", { name: nombre }).click();
  await page.waitForURL(/\/crm\/\d+$/, { timeout: 45_000 });

  const match = page.url().match(/\/crm\/(\d+)$/);
  if (!match) {
    throw new Error(`Expected a cliente URL, got ${page.url()}`);
  }
  return match[1];
}

test.describe("documentos", () => {
  test.describe("full flow as an admin", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE_PATH });

    test("uploads, adds a version, downloads, and zips a selection", async ({
      page,
    }) => {
      // Uploads move real bytes through a Route Handler into real Storage, and
      // the zip step streams an archive back — well past the default budget on
      // top of dev-mode cold compiles (README's WSL note).
      test.setTimeout(240_000);

      const clienteNombre = `E2E Docs ${Date.now()}`;
      const clienteId = await createCliente(page, clienteNombre);

      await page.getByRole("link", { name: "Documentos" }).click();
      await page.waitForURL(/\/crm\/\d+\/documentos$/, { timeout: 45_000 });

      // --- Upload a new document ---
      await page.getByRole("button", { name: "Subir documento" }).click();
      const uploadDialog = page.getByRole("dialog");
      await uploadDialog.getByLabel("Archivo").setInputFiles({
        name: "acta.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("acta version 1"),
      });
      await uploadDialog.getByLabel("Nombre").fill("Acta E2E");
      await uploadDialog.getByLabel("Etiquetas").fill("legal, e2e");
      await uploadDialog.getByRole("button", { name: "Subir" }).click();

      await expect(page.getByText("Documento subido.")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("Acta E2E")).toBeVisible();
      // The category label resolves through the catalog the fixtures seeded.
      await expect(
        page.getByText(E2E_DOC_CATEGORIA_ETIQUETA).first(),
      ).toBeVisible();

      // --- Add a second version ---
      await page
        .getByRole("button", { name: "Historial de versiones" })
        .click();
      const versionDialog = page.getByRole("dialog");
      await versionDialog.getByLabel("Archivo").setInputFiles({
        name: "acta-v2.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("acta version 2 with more bytes"),
      });
      await versionDialog
        .getByRole("button", { name: "Subir nueva versión" })
        .click();

      await expect(page.getByText("Nueva versión subida.")).toBeVisible({
        timeout: 60_000,
      });
      // Both versions are retained and listed newest-first (spec
      // document-versioning "History lists all versions newest-first").
      await expect(versionDialog.getByText("acta-v2.pdf")).toBeVisible();
      await expect(versionDialog.getByText("acta.pdf")).toBeVisible();

      // Version 1 must be downloadable AS ITSELF, not silently redirected to
      // the current version (spec "Historic version is downloadable"). Asserted
      // through the request API so the 302 and its Location are observable —
      // following it in the browser would only show the final object.
      const historicLinks = versionDialog.getByRole("link", {
        name: "Descargar",
      });
      const historicHref = await historicLinks.last().getAttribute("href");
      expect(historicHref).toContain("version=1");

      await page.keyboard.press("Escape");

      // --- Single download of the current version ---
      const downloadUrl = await page
        .getByRole("row")
        .nth(1)
        .getByRole("link", { name: "Descargar" })
        .getAttribute("href");
      expect(downloadUrl).toBeTruthy();

      const redirect = await page.request.get(downloadUrl!, {
        maxRedirects: 0,
      });
      expect(redirect.status()).toBe(302);
      // A real short-lived signed URL from the private bucket.
      expect(redirect.headers()["location"]).toContain("token=");

      // The historic version resolves to a DIFFERENT object than the current
      // one — proof the ?version= parameter is honoured end to end.
      const historicRedirect = await page.request.get(historicHref!, {
        maxRedirects: 0,
      });
      expect(historicRedirect.status()).toBe(302);
      expect(historicRedirect.headers()["location"]).not.toBe(
        redirect.headers()["location"],
      );

      // --- Multi-select zip export (allowed: admin has exportar) ---
      await page
        .getByRole("checkbox", { name: "Seleccionar Acta E2E" })
        .check();

      const downloadPromise = page.waitForEvent("download", {
        timeout: 60_000,
      });
      await page
        .getByRole("button", { name: "Descargar seleccionados (.zip)" })
        .click();
      const zip = await downloadPromise;
      expect(zip.suggestedFilename()).toBe(`documentos-${clienteId}.zip`);
    });
  });

  test.describe("category denial", () => {
    test.use({ storageState: DOC_DENIED_STORAGE_STATE_PATH });

    test("a role without the category grant sees no documents at all", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      // This user has documentos.ver — the module verb is NOT the thing denying
      // it. Reaching the tab and finding it empty is what proves the third
      // (category) axis composes independently (spec document-permissions).
      await page.goto("/crm");

      const firstCliente = page
        .getByRole("link", { name: /E2E Docs / })
        .first();
      await expect(firstCliente).toBeVisible({ timeout: 45_000 });
      await firstCliente.click();
      await page.waitForURL(/\/crm\/\d+$/, { timeout: 45_000 });

      await page.getByRole("link", { name: "Documentos" }).click();
      await page.waitForURL(/\/crm\/\d+\/documentos$/, { timeout: 45_000 });

      await expect(
        page.getByText("Todavía no hay documentos para este cliente."),
      ).toBeVisible();
      // Nothing to select means no zip affordance either.
      await expect(page.getByRole("checkbox")).toHaveCount(0);
    });
  });

  test.describe("export denial", () => {
    test.use({ storageState: DOC_NOEXPORT_STORAGE_STATE_PATH });

    test("a role granted the category but lacking exportar can read yet not zip", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      await page.goto("/crm");

      const firstCliente = page
        .getByRole("link", { name: /E2E Docs / })
        .first();
      await expect(firstCliente).toBeVisible({ timeout: 45_000 });
      await firstCliente.click();
      await page.waitForURL(/\/crm\/\d+$/, { timeout: 45_000 });

      await page.getByRole("link", { name: "Documentos" }).click();
      await page.waitForURL(/\/crm\/\d+\/documentos$/, { timeout: 45_000 });

      // Reading works — the category IS granted to this role.
      await expect(page.getByText("Acta E2E")).toBeVisible({ timeout: 45_000 });

      await page
        .getByRole("checkbox", { name: "Seleccionar Acta E2E" })
        .check();
      await page
        .getByRole("button", { name: "Descargar seleccionados (.zip)" })
        .click();

      // The route's exportar pre-check refuses, and the table surfaces it
      // inline rather than failing silently or downloading a partial archive.
      await expect(page.getByRole("alert")).toBeVisible({ timeout: 45_000 });
    });
  });
});
