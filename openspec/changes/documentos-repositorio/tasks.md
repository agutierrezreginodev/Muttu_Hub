# Tasks — Repositorio de documentos (`documentos-repositorio`)

Strict-TDD ordered: RED (pgTAP / vitest) is written and failing BEFORE the GREEN
implementation in each unit. Grouped into stacked-PR-sized work units (each ≤ ~400
changed lines). PRs stack in order; each is independently reviewable.

---

## PR1 — DB: category-permission foundation (`documentos_categoria_permiso`)

- [x] 1.1 RED: write `supabase/tests/documentos_categoria_permiso_rls.sql` — `plan(n)`;
      fixtures (roles/users); assert `categoria_visible` true with a grant, false without,
      fail-closed for no `auth.uid()` and for an inactive user; grant-table FK rejects an
      unlisted category (`23503`); admin-only INSERT/DELETE (`42501` for non-admin);
      SELECT readable by authenticated.
- [x] 1.2 GREEN: create `supabase/migrations/<ts>_documentos_categoria_permiso.sql` —
      `documento_categoria_permiso` table (PK `(rol_id, categoria)`, composite FK to
      `catalogo`), `private.categoria_visible(text)` (mirror `has_permission`: STABLE,
      SECURITY DEFINER, `search_path=''`, wrapped call sites), RLS enable+force, grants
      (SELECT authenticated + service_role; INSERT/DELETE via `admin.editar` policy),
      revoke/grant EXECUTE on the resolver.
- [x] 1.3 (partial — CI-deferred) `check-migration-tests.sh` verified passing locally for
      this file; pgTAP execution itself requires the `supabase` CLI, not installed in this
      environment — CI (`supabase/setup-cli@v1` + `supabase test db`) runs the RED file
      above against the migration at PR time and is the actual gate.

## PR2 — DB: documento + versioning core (`documentos_repositorio`)

> Budget risk: HIGH (~380 lines incl. test). If review budget is tight, split PR2a
> (tables + RLS + `v_documento` + CAT5) and PR2b (`add_documento_version` +
> `soft_delete_documento`).
>
> APPLIED: split into PR2a (`20260730130000_documentos_repositorio.sql` + test) and
> PR2b (`20260730140000_documento_version_rpc.sql` + test) — measured size still
> exceeded budget even split (PR2a 490 lines incl. test; PR2b 284 lines incl. test),
> disclosed in apply-progress. Each is an independent, reviewable work-unit.

- [x] 2.1 RED: write `supabase/tests/documentos_repositorio_rls.sql` — 3-axis
      SELECT/INSERT/UPDATE matrix (cliente_visible × `documentos.<verb>` × category) across
      Admin/Gerencia/Coordinador/Colaborador; recategorize gated on old (USING) + new
      (WITH CHECK); no-direct-write-grant on `documento_version`, `unique(documento_id,
      version)` collision; denormalized `cliente_id` composite-FK anti-drift;
      soft-delete-parent hides versions; CAT5 rejects an in-use `categoria_documento`
      code; `v_documento` is `security_invoker` and reports the latest version.
      (`add_documento_version`/`soft_delete_documento` RPC assertions moved to PR2b's
      own RED file, `supabase/tests/documento_version_rpc_rls.sql`, per the split.)
- [x] 2.2 GREEN: created `supabase/migrations/20260730130000_documentos_repositorio.sql` —
      `documento` (NOT NULL `categoria` + discriminator + composite FK,
      `unique(id,cliente_id)`, audit, `tags text[]`), `documento_version` (denormalized
      `cliente_id`, composite FK, `unique(documento_id,version)`, `storage_path` unique),
      `v_documento` (lateral latest version), RLS enable+force on both, grants
      (documento: SELECT/INSERT + column-scoped UPDATE excluding discriminator/audit/
      `deleted_at`; version: SELECT only).
- [x] 2.3 GREEN: policies per design (`documento_select/insert/update`,
      `documento_version_select` derives from parent) — same migration as 2.2.
- [x] 2.4 GREEN: `add_documento_version` + `soft_delete_documento` (private + public
      wrapper, definer, gated) in `supabase/migrations/20260730140000_documento_version_rpc.sql`
      (PR2b), RED-first in `supabase/tests/documento_version_rpc_rls.sql`; CAT5 half
      (extend `private.soft_delete_catalogo` with the non-deleted-`documento` category
      `EXISTS` branch) shipped in PR2a's migration instead (grouped with the tables it
      protects, per the 2a/2b split boundary).
- [x] 2.5 (partial — CI-deferred, same posture as PR1) `check-migration-tests.sh`
      verified passing locally for both PR2a/PR2b files; `pnpm typecheck`/`lint`/`test`
      all green (139 vitest tests, no regression — this slice touches zero TypeScript).
      Actual pgTAP execution requires the `supabase` CLI, not installed locally — CI
      (`supabase/setup-cli@v1` + `supabase test db`) is the real gate.

## PR3 — DB: storage bucket + policies (`documentos_storage`)

- [x] 3.1 RED: write `supabase/tests/documentos_storage_rls.sql` — bucket exists + private;
      `storage.objects` SELECT `EXISTS`-delegation (a category-denied role finds no object
      for a path whose version it cannot see; an authorized role does); INSERT gate
      (`cliente_visible((foldername)[1]::bigint) + documentos.crear`); no UPDATE/DELETE
      policy for authenticated.
- [x] 3.2 GREEN: created `supabase/migrations/20260730150000_documentos_storage.sql` —
      insert bucket `documentos` (private, on-conflict-do-nothing); SELECT policy delegates
      to `documento_version` RLS via `EXISTS`; INSERT policy gates on
      `cliente_visible((foldername)[1]::bigint) + documentos.crear`; no UPDATE/DELETE
      policy for authenticated.
- [ ] 3.3 Skipped (owner has not resolved open question 6): no `[storage.buckets.documentos]`
      mime allow-list / size block added to `config.toml`. Explicitly optional per this task's
      own wording — revisit once the owner confirms restrictions.
- [x] 3.4 (partial — CI-deferred, same posture as PR1/PR2) `check-migration-tests.sh`
      verified passing locally for this file (13 migrations, 13 pgTAP test pairings);
      `pnpm typecheck`/`lint`/`test` all green (139 vitest tests, no regression — this
      slice touches zero TypeScript). Actual pgTAP execution requires the `supabase` CLI,
      not installed locally — CI (`supabase/setup-cli@v1` + `supabase test db`) is the
      real gate.

## PR4 — Lib: schemas + queries + metadata actions + copy

> APPLIED: measured 1,012 lines (627 test + 385 impl incl. `es.ts`) across two
> commits (RED tests, then GREEN implementation) — well over the 400-line budget,
> disclosed here per the same chained-PR review posture as PR2a/PR2b. Not
> split further: tasks.md groups all of schemas/queries/storage-paths/actions/
> copy under this one slice with no documented split option (unlike PR2), and
> the four lib areas are tightly coupled (actions depends on schemas; queries
> and storage-paths are the smallest, standalone pieces). Flagged for the
> owner's awareness before PR5/PR6 land.

- [x] 4.1 RED: `src/lib/documentos/schemas.test.ts` — zod: `nombre` required, `categoria`
      required, `tags` array, `descripcion` optional-trimmed, upload metadata (mime/size
      shape). Follow `src/lib/crm/schemas.ts` `optionalTrimmed` conventions.
- [x] 4.2 GREEN: `src/lib/documentos/schemas.ts`.
- [x] 4.3 RED: `src/lib/documentos/queries.test.ts` — `listDocumentos(clienteId)` and
      `listVersiones(documentoId)` map rows; trust-RLS (empty, not error). Established a
      new mocking pattern (`vi.mock("@/lib/supabase/server")` + a thenable query-builder
      stub) — no prior `*.test.ts` in this codebase unit-tested a Supabase-calling query
      function directly.
- [x] 4.4 GREEN: `src/lib/documentos/queries.ts` (reads `v_documento` + `documento_version`).
- [x] 4.5 GREEN: `src/lib/documentos/storage-paths.ts` — pure path builder
      `{cliente_id}/{documento_id}/{version}/{filename}` + filename sanitizer (+ unit test,
      `storage-paths.test.ts`, RED-first). Sanitizer strips path separators (defends
      against traversal), transliterates diacritics (NFD strip, e.g. "señal" ->
      "senal") instead of dropping accented letters outright, collapses whitespace to
      `_`, and falls back to `"documento"` when nothing survives.
- [x] 4.6 RED: `src/lib/documentos/actions.test.ts` — `updateDocumentoAction` /
      `deleteDocumentoAction` do permission pre-check (`assertDocumentosPermission`) → zod →
      write/RPC → `revalidatePath`, mocked. Established the actions.test.ts mocking
      pattern for this codebase (mocks `createClient`'s `rpc()`/`.from()` directly + `next/
      cache`'s `revalidatePath`) — no prior `actions.ts` was unit-tested directly before
      this (every existing `*-dialog.test.tsx` only mocks the action function one layer up).
- [x] 4.7 GREEN: `src/lib/documentos/actions.ts` — mirror `src/lib/crm/actions.ts`
      (`assertDocumentosPermission('documentos', accion)`, editar/eliminar paths). Only
      `updateDocumentoAction`/`deleteDocumentoAction` — create/add-version are byte
      transport (Route Handlers, PR6 per design Decision 6), not Server Actions.
- [x] 4.8 GREEN: extend `src/messages/es.ts` — `es.crm.tabs.documentos = "Documentos"` +
      `es.documentos.*` (labels, buttons, dialogs, zip, version history, errors).

## PR5a — UI: 7th tab + list + FC8 reversal

- [ ] 5a.1 RED: rewrite `src/app/(app)/crm/[id]/ficha-tabs.test.tsx` — assert **7** links,
      the 7-label ordered set incl. "Documentos", and a `/documentos` link EXISTS; DELETE
      the "never renders Documentos" / "never renders /documentos link" assertions.
- [ ] 5a.2 GREEN: `ficha-tabs.tsx` — append the Documentos `TABS` entry; rewrite the
      forbidding doc-comment to describe the now-present 7th tab.
- [ ] 5a.3 RED: `documentos-table.test.tsx` — renders rows from `v_documento`, empty state,
      resolves category label via catalog, multi-select checkboxes toggle selection.
- [ ] 5a.4 GREEN: `crm/[id]/documentos/page.tsx` (server: `Promise.all` list + catalog
      options) → `documentos-table.tsx` (client, presentational, mirrors
      `oportunidades-table.tsx`), with per-row download link + selection state.

## PR5b — UI: upload + version history + edit/delete dialogs

- [ ] 5b.1 RED: `upload-documento-dialog.test.tsx` + `documento-version-dialog.test.tsx` +
      `edit-documento-dialog.test.tsx` + `delete-documento-dialog.test.tsx` — form state,
      submit wiring (mock the upload route / actions), success toast, error alert.
- [ ] 5b.2 GREEN: `upload-documento-dialog.tsx` (file input + category select + name/desc/
      tags; posts multipart to the upload Route Handler), `documento-version-dialog.tsx`
      (history list + per-version download + "upload new version"),
      `edit-documento-dialog.tsx` (rename/recategorize/desc/tags via
      `updateDocumentoAction`), `delete-documento-dialog.tsx` (soft-delete). Mirror the
      oportunidad dialogs (h-11 targets, `useTransition`, toast).

## PR6 — Route Handlers: upload + single download + zip export

- [ ] 6.1 RED: `upload/route.test.ts` (or E2E) — multipart parse; gate pre-check; on new
      doc creates parent+v1; on existing doc adds next version via RPC; denies ungranted
      category.
- [ ] 6.2 GREEN: `crm/[id]/documentos/upload/route.ts` — parse multipart; RLS-gated client;
      validate metadata gates; `storage.upload(path, bytes)`; `add_documento_version` RPC;
      `revalidatePath`.
- [ ] 6.3 GREEN: `crm/[id]/documentos/[documentoId]/descargar/route.ts` — resolve requested
      version's path; `createSignedUrl(path, ttl)`; 302 redirect; 404 when not visible.
- [ ] 6.4 RED: zip entry-naming helper test + `descargar-zip/route.test.ts` — `exportar`
      pre-check denies without it; unauthorized selections excluded; duplicate filenames
      both survive.
- [ ] 6.5 GREEN: add `fflate` dep; `crm/[id]/documentos/descargar-zip/route.ts` — POST
      selection; `has_permission('documentos','exportar')` gate; select visible current
      versions (RLS-gated); stream `fflate` zip; count/size cap; collision-safe names.
- [ ] 6.6 Wire the zip button + single-download links in `documentos-table.tsx`.

## PR7 — Admin: category-grant editor

- [ ] 7.1 RED: `category-grants-editor.test.tsx` + admin action tests — role × category grid
      toggles write/remove `documento_categoria_permiso`; admin-gated.
- [ ] 7.2 GREEN: admin screen + server actions (mirror `permissions-grid-editor.tsx` /
      admin actions) to grant/revoke categories per role; copy in `es.ts`.

## PR8 — E2E: full flow against real local Supabase + Storage

- [ ] 8.1 GREEN: Playwright `e2e/documentos.spec.ts` — upload → new version → per-category
      visibility with two roles (granted vs denied) → single download → multi-select zip
      (allowed with `exportar`, denied without).

---

## Review Workload Forecast

- **Estimated changed lines:** ~1,900–2,300 across 9 slices (PR2 and PR5 are the heaviest).
- **400-line budget risk:** HIGH for PR2 (DB core ~380) and PR5 (UI). PR5 is already
  pre-split into 5a/5b to stay under budget; PR2 has a documented 2a/2b split option.
- **Chained PRs recommended:** **YES.** DB slices (PR1→PR2→PR3) must land before lib (PR4),
  which precedes UI (PR5a→PR5b) and Route Handlers (PR6). Admin (PR7) and E2E (PR8) close it.
- **Decision needed before apply:** YES — resolve the open questions below (esp. category
  codes, add-version verb, zip caps) and confirm the delivery strategy for the chained
  stack.

## Open Questions (owner to resolve before apply)

1. Business-approved `categoria_documento` codes (catalog ships empty, like `tipo_cliente`).
2. Category grants role-level only (proposed) or also `usuario.permisos_override`?
3. Adding a NEW version gated on `documentos.crear` (proposed) or `editar`?
4. Standalone cross-cliente library view now, or defer (proposed defer)?
5. Storage retention: keep bytes on soft-delete (proposed); need an orphan-cleanup job?
6. Per-bucket mime allow-list / size cap in `config.toml` (global 50MiB already set)?
7. Zip export count / total-size caps to protect the serverless runtime?
