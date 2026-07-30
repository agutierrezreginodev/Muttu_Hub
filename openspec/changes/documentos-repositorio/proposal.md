# Proposal — Repositorio de documentos (`documentos-repositorio`)

## Intent

Add a document library to Muttu Hub, surfaced as the **7th ficha tab "Documentos"**
on the cliente ficha. Each document carries structured metadata, is versioned,
can be multi-selected and downloaded as a single zip, and its visibility is gated
per document **category** on top of the existing `documentos` permission module and
`cliente_visible` RLS. Files live in a private Supabase Storage bucket whose
`storage.objects` RLS delegates to the same metadata-layer gate, so bytes inherit
the exact composed authorization of the metadata row.

This change activates the `documentos` permission module, which already exists in
the fixed 5×5 grid (`src/lib/permissions/schema.ts`, DB CHECK
`private.permisos_grid_valid`) but has had no consuming feature until now.

## Scope

### In

- New tables: `documento` (parent metadata), `documento_version` (per-version file
  rows, RPC-only write path), `documento_categoria_permiso` (role → category grant).
- New catalog `tipo`: `categoria_documento` (catalog-FK dropdown, CAT5-guarded).
- New RLS helper `private.categoria_visible(text)` composed into every `documento`
  policy alongside `has_permission('documentos', …)` and `cliente_visible`.
- New RPCs: `add_documento_version`, `soft_delete_documento`.
- New private Storage bucket `documentos` + `storage.objects` policies that delegate
  visibility to `documento_version` RLS.
- 7th ficha tab route `/(app)/crm/[id]/documentos` (server `page.tsx` → client table),
  version-history view, upload dialog, rename/recategorize/description/tags edit,
  soft-delete, per-row single download, multi-select zip export.
- Route Handlers for byte transport: upload (multipart), single download (signed-URL
  redirect), and zip export (streamed, gated on `documentos.exportar`).
- Minimal admin surface to grant categories to roles (`documento_categoria_permiso`).
- Reversal of the spec-FC8 discipline test in `ficha-tabs.test.tsx` (see Risks).
- Spanish copy in `src/messages/es.ts` (`es.crm.tabs.documentos`, `es.documentos.*`).
- pgTAP per migration, vitest beside every lib/UI unit, Playwright E2E against a real
  local Supabase + Storage.

### Out (deferred, with justification)

- **Standalone cross-cliente library screen.** The 7th ficha tab is the primary and
  only surface in this change. A cross-cliente listing reads the _same_ RLS-gated
  `v_documento`, so it can be added later with zero schema change — keeping it out now
  bounds the PR count.
- **User-level (override) category grants.** Category access is role-level only,
  mirroring the simplest composition with `rol.permisos`. `usuario.permisos_override`
  is not extended for categories in this change (open question 2).
- **Hard-deletion / retention of storage bytes.** Soft-delete flips
  `documento.deleted_at`; the underlying objects are retained. Orphan cleanup is a
  future retention job (open question 5).
- **In-browser preview / OCR / full-text search of document contents.** Only metadata
  (name, category, description, tags) is searchable in this change.
- **Seeding `categoria_documento` codes.** Same posture as `tipo_cliente` in PR1:
  business-approved category codes are a product decision this change has no authority
  to make; the catalog ships empty and admin adds real codes (open question 1).

## Capabilities

### New

| Capability             | Spec file                            | Summary                                                                                                     |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `document-library`     | `specs/document-library/spec.md`     | Metadata model, the 7th tab, list/upload/rename/recategorize/soft-delete, single download, storage layout.  |
| `document-versioning`  | `specs/document-versioning/spec.md`  | Parent + version-row model, monotonic version numbers, retained history, RPC-only write path.               |
| `document-permissions` | `specs/document-permissions/spec.md` | Per-category access composed with `documentos` module + `cliente_visible` in RLS, and at the storage layer. |
| `document-zip-export`  | `specs/document-zip-export/spec.md`  | Multi-select streamed zip via a Route Handler gated on `documentos.exportar`.                               |

### Modified

- **`crm-ficha-cliente` (spec FC8).** FC8 currently mandates _exactly 6_ ficha tabs and
  _no_ Documentos tab/stub. This change adds Documentos as the **7th** tab; FC8's tab
  count and the `ficha-tabs.test.tsx` assertions are updated accordingly (never left
  as a dead link — the route ships in the same slice as the tab entry).
- **`private.soft_delete_catalogo` (CAT5 guard).** Extended to reject deactivating a
  `categoria_documento` code still referenced by a non-deleted `documento`, exactly as
  PR3 extended it for `perfil_decision` / `estado_oportunidad` / `servicio_interes`.

## Approach

1. **Data model** — parent/child versioning (`documento` + `documento_version`);
   "current version" is derived (highest `version`) via `v_documento`, avoiding a
   circular FK. `documento_version` is RPC-write-only, mirroring `oportunidad_servicio`.
2. **Permissions** — a role→category grant table feeds `private.categoria_visible`,
   AND-composed with `has_permission('documentos', …)` and `cliente_visible` in every
   `documento` policy — two orthogonal axes (verb × category × cliente scope).
3. **Storage** — private bucket `documentos`; path `{cliente_id}/{documento_id}/{version}/{filename}`.
   The `storage.objects` SELECT policy delegates to `documento_version` RLS via
   `EXISTS`, so bytes inherit the full composed gate (including category) without
   encoding category in the path.
4. **Byte transport** — Route Handlers (Node runtime, `fflate` for streaming zips);
   metadata-only mutations stay Server Actions, mirroring `src/lib/crm/actions.ts`.
5. **UI** — mirror the PR7 oportunidades tab pattern (server fetch → client table →
   dialogs) exactly.

## Affected Areas

| Area           | Path                                                                                                   | Change                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| DB migration   | `supabase/migrations/*_documentos_categoria_permiso.sql`                                               | NEW grant table + `categoria_visible`.                                          |
| DB migration   | `supabase/migrations/*_documentos_repositorio.sql`                                                     | NEW `documento`, `documento_version`, `v_documento`, RPCs, CAT5 extension.      |
| DB migration   | `supabase/migrations/*_documentos_storage.sql`                                                         | NEW bucket + `storage.objects` policies.                                        |
| DB tests       | `supabase/tests/documentos_*_rls.sql`                                                                  | RED pgTAP per migration (CI-enforced).                                          |
| Lib            | `src/lib/documentos/{schemas,queries,actions,storage-paths}.ts` (+ `*.test.ts`)                        | NEW zod / query / action / path helpers.                                        |
| Permissions    | `src/lib/permissions/*`                                                                                | No grid change (`documentos` already present); UI gating reads the merged grid. |
| Route          | `src/app/(app)/crm/[id]/documentos/page.tsx` + client components                                       | NEW 7th tab.                                                                    |
| Route Handlers | `.../documentos/upload/route.ts`, `.../[documentoId]/descargar/route.ts`, `.../descargar-zip/route.ts` | NEW byte transport.                                                             |
| Tabs           | `src/app/(app)/crm/[id]/ficha-tabs.tsx` + `ficha-tabs.test.tsx`                                        | 7th tab + FC8 test reversal.                                                    |
| Admin          | `src/app/(app)/admin/...` category-grant surface (+ actions/tests)                                     | NEW role→category editor.                                                       |
| Copy           | `src/messages/es.ts`                                                                                   | NEW `es.crm.tabs.documentos`, `es.documentos.*`.                                |
| Config         | `supabase/config.toml`                                                                                 | Optional `[storage.buckets.documentos]` block (mime allow-list / size).         |

## Risks

| Risk                                                     | Likelihood   | Impact                        | Mitigation                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FC8 reversal skipped or done as a dead link              | Med          | High (broken tab / red suite) | Tab entry, route, and the FC8 test reversal ship in the **same** slice; task explicitly reverses each assertion.                                                                                                        |
| Category not enforced on the byte layer                  | Med          | High (data exposure)          | `storage.objects` SELECT policy delegates to `documento_version` RLS via `EXISTS`; a pgTAP test asserts a category-denied role cannot mint a signed URL.                                                                |
| Category unenforced on **upload** (path has no category) | Med          | Med                           | Upload flow checks `categoria_visible` at the metadata insert BEFORE writing bytes; storage INSERT policy adds `cliente_visible + crear` defense-in-depth. Orphan bytes are invisible (no version row references them). |
| Zip route memory/timeout on large multi-select           | Med          | Med                           | Stream with `fflate` (no full buffering); cap count/total size (open question 7); Edge Function is the documented escape hatch.                                                                                         |
| Circular FK (`documento` ↔ current version)              | Low          | Med                           | Avoided entirely — current version is derived (`max(version)`), not stored.                                                                                                                                             |
| Server Action 1 MB body cap breaks uploads               | High if used | High                          | Byte transport uses Route Handlers (multipart), never Server Actions.                                                                                                                                                   |
| New npm dep (`fflate`) not yet installed                 | High         | Low                           | Added in the zip-export slice; zero-dependency, streaming, Node+Edge safe.                                                                                                                                              |
| Version-number race (two concurrent uploads)             | Low          | Med                           | `add_documento_version` computes `max(version)+1` inside a single definer statement; `unique(documento_id, version)` rejects a collision (caller retries).                                                              |

## Rollback Plan

- **Pre-release (any slice):** revert the slice's PR; migrations are additive and
  isolated (new tables / new bucket / new routes) — no existing table is altered except
  the `create or replace` of `soft_delete_catalogo`, which is idempotent and backward
  compatible (only adds a new `EXISTS` branch).
- **Post-release forward-fix:** ship a migration dropping the three new tables (cascades
  the version/junction), the bucket, and the two RPCs; `create or replace
soft_delete_catalogo` back to the PR3 body. The 7th tab is removed by reverting
  `ficha-tabs.tsx` + restoring the FC8 6-tab test. No CRM/identity data is touched.
- **Storage bytes:** dropping the bucket removes objects; if data must be preserved,
  keep the bucket and only drop metadata tables (bytes become inert/unreferenced).

## Dependencies

- Existing: `private.has_permission`, `private.cliente_visible`, `private.audit_fields`,
  the `catalogo` table + CAT5 guard, the `documentos` permission module, the ficha shell
  (`[id]/layout.tsx`, `ficha-tabs.tsx`), the PR7 tab pattern.
- New runtime dep: `fflate` (streaming zip) for the zip-export Route Handler.
- Supabase Storage enabled (`config.toml [storage] enabled = true` — already on).
- **Independent of the concurrent Kanban work** — no shared tables, routes, or RPCs.

## Success Criteria

- [ ] A user with `documentos.ver` + a category grant + `cliente_visible` sees exactly
      the documents in their granted categories for that cliente; a user missing any one
      axis sees none (RLS-verified, not UI-only).
- [ ] Uploading a new version increments `version`, retains prior versions, and updates
      the "current" row surfaced by `v_documento`.
- [ ] Version history for a document is listable and each historic version is
      downloadable (subject to the same gate).
- [ ] Multi-selecting documents and clicking "Descargar zip" streams a single zip;
      the action is denied without `documentos.exportar`.
- [ ] A category-denied role cannot mint a signed URL nor appear in a zip, proven at the
      `storage.objects` layer (pgTAP + E2E).
- [ ] `soft_delete_catalogo` refuses to deactivate a `categoria_documento` code in use.
- [ ] The ficha renders exactly **7** tabs (General … Tareas relacionadas, **Documentos**);
      the FC8 test asserts 7 and no longer forbids Documentos.
- [ ] Every migration has a matching pgTAP test (`scripts/check-migration-tests.sh` green).
- [ ] No hardcoded user-facing strings; all copy in `es.ts`.
