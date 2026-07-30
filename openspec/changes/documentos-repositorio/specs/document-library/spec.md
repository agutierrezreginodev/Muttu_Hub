# Spec — document-library

## ADDED Requirements

### Requirement: Document metadata model

The system SHALL store each document as a `public.documento` row carrying structured
metadata: `nombre` (NOT NULL), `categoria` (NOT NULL, FK to `catalogo` under tipo
`categoria_documento`), `descripcion` (nullable), `tags` (`text[]`, default `{}`), its
`cliente_id` association (NOT NULL, FK to `cliente`), and the standard audit columns
(`created_at/by`, `updated_at/by`, `deleted_at`). Per-version physical attributes
(size, mime, storage path, uploader) SHALL live on `documento_version`, NOT on the
parent (see document-versioning).

`categoria` MUST be NOT NULL because it is the gating axis for
`document-permissions`; a document without a category could not be authorization-checked.

#### Scenario: A document requires a category

- **GIVEN** an authenticated user with `documentos.crear` and a grant on category `contratos`
- **WHEN** they create a document with no `categoria`
- **THEN** the insert is rejected (NOT NULL / FK violation) and no `documento` row exists.

#### Scenario: Category is a catalog FK

- **GIVEN** the `categoria_documento` catalog contains code `contratos`
- **WHEN** a document is created with `categoria = 'inexistente'`
- **THEN** the composite FK to `catalogo(tipo, codigo)` rejects it (SQLSTATE `23503`).

#### Scenario: The category discriminator is tamper-proof

- **GIVEN** a `documento` row
- **WHEN** any authenticated role attempts `UPDATE documento SET categoria_cat_tipo = 'x'`
- **THEN** it is rejected (`42501`) — the discriminator is excluded from every UPDATE grant,
  same tamper-proofing as audit columns.

### Requirement: Documentos ficha tab (7th tab)

The cliente ficha SHALL render Documentos as the **7th** tab, appended after "Tareas
relacionadas", implemented as a real nested route segment
`/(app)/crm/[id]/documentos` and a `Link` entry in `FichaTabs` — never as a stub or a
dead link. This SUPERSEDES the prior FC8 discipline (exactly 6 tabs, no Documentos):
after this change the ficha renders exactly **7** tabs and `ficha-tabs.test.tsx`
asserts the 7-tab set including Documentos.

#### Scenario: Ficha renders 7 tabs including Documentos

- **GIVEN** a visible cliente ficha
- **WHEN** the tab nav renders
- **THEN** exactly 7 links appear, in order: General, Contactos, Oportunidades,
  Compromisos, Bitácora, Tareas relacionadas, Documentos
- **AND** the Documentos link points to `/crm/{id}/documentos`, a route that exists.

#### Scenario: Documentos tab is server-fetched

- **GIVEN** the Documentos route
- **WHEN** it loads
- **THEN** the server `page.tsx` fetches the document list and catalog options
  (`Promise.all`) and passes them to a client table, mirroring the oportunidades tab.

### Requirement: List documents for a cliente

The system SHALL list, for a given `cliente_id`, every non-deleted `documento` the
caller is authorized to see, reading the `v_documento` view (which exposes parent
metadata joined to the current version's physical attributes). A caller lacking any
authorization axis (cliente visibility, `documentos.ver`, or the document's category)
SHALL receive an empty result, never an error — the same trust-RLS convention as every
other CRM query helper.

#### Scenario: Only authorized documents are listed

- **GIVEN** cliente 701 has documents in categories `contratos` and `legal`
- **AND** the caller has `documentos.ver` and a grant on `contratos` only
- **WHEN** the caller lists documents for cliente 701
- **THEN** only the `contratos` documents appear; the `legal` documents are absent.

#### Scenario: Denied SELECT returns empty, not an error

- **GIVEN** a caller without `documentos.ver`
- **WHEN** they query `v_documento` for any cliente
- **THEN** zero rows return and no exception is raised.

### Requirement: Upload a document (new document, first version)

The system SHALL let a user with `documentos.crear`, a grant on the target category,
and visibility of the target cliente upload a file, creating the `documento` parent and
its first `documento_version` (version 1). File bytes SHALL be transported via a Route
Handler (multipart), NOT a Server Action (which caps request bodies at ~1 MB). The
category grant SHALL be checked at the metadata layer before bytes are written.

#### Scenario: Authorized create with first version

- **GIVEN** a user with `documentos.crear` + grant on `contratos` + visibility of cliente 701
- **WHEN** they upload `acta.pdf` with category `contratos`
- **THEN** a `documento` row and a `documento_version` (version 1) are created,
  the object is stored at `701/{documento_id}/1/acta.pdf`, and `uploaded_by` = their id.

#### Scenario: Create denied for an ungranted category

- **GIVEN** a user with `documentos.crear` but NO grant on `legal`
- **WHEN** they attempt to upload with category `legal`
- **THEN** the metadata insert is rejected by RLS (`categoria_visible` false) and no
  bytes are recorded as a document version.

### Requirement: Edit document metadata

The system SHALL let a user with `documentos.editar` + category grant + cliente
visibility rename a document, edit its description/tags, and **recategorize** it. On
recategorization the caller MUST be granted BOTH the old category (USING) and the new
category (WITH CHECK); a user cannot move a document into a category they lack.

#### Scenario: Rename succeeds with editar

- **GIVEN** a user with `documentos.editar` + grant on the document's category
- **WHEN** they change `nombre`
- **THEN** the row updates and `updated_by` is set by `audit_fields()`.

#### Scenario: Recategorize into an ungranted category is blocked

- **GIVEN** a user granted `contratos` but NOT `legal`
- **WHEN** they attempt to recategorize a `contratos` document to `legal`
- **THEN** the update is rejected (`WITH CHECK categoria_visible('legal')` false).

### Requirement: Soft-delete a document

The system SHALL soft-delete a document only via `public.soft_delete_documento(p_id)`,
gated on `documentos.eliminar` + category grant + cliente visibility. `authenticated`
SHALL NOT hold a DELETE grant on `documento`. Soft-delete sets `deleted_at`; underlying
storage bytes are retained (out of scope: orphan cleanup).

#### Scenario: Soft-delete requires eliminar

- **GIVEN** a user with `documentos.editar` but not `documentos.eliminar`
- **WHEN** they call `soft_delete_documento`
- **THEN** it raises `42501` and `deleted_at` stays null.

#### Scenario: No direct DELETE grant

- **GIVEN** any authenticated role
- **WHEN** it runs `DELETE FROM documento`
- **THEN** it is rejected at the grant layer (`42501`).

### Requirement: Single-document download

The system SHALL let an authorized caller download the current (or a chosen historic)
version of a document via a Route Handler that issues a short-lived signed URL from the
private `documentos` bucket. Because the `storage.objects` SELECT policy delegates to
`documento_version` RLS, a caller who cannot see the document cannot mint a URL.

#### Scenario: Authorized single download

- **GIVEN** an authorized caller and a document with a current version
- **WHEN** they request its download
- **THEN** the handler returns a redirect to a signed URL valid for a short TTL.

#### Scenario: Unauthorized single download denied

- **GIVEN** a caller lacking the document's category grant
- **WHEN** they request its download
- **THEN** no signed URL is issued (storage SELECT policy denies) and the handler 404s.

### Requirement: Storage layout and bucket

The system SHALL store document bytes in a **private** Supabase Storage bucket named
`documentos` (not public). Object paths SHALL follow
`{cliente_id}/{documento_id}/{version}/{original_filename}` so that
`(storage.foldername(name))[1]` yields the `cliente_id` for the storage INSERT policy.

#### Scenario: Bucket is private

- **GIVEN** the `documentos` bucket
- **WHEN** an object URL is requested without a valid signature
- **THEN** access is denied — the bucket is not publicly readable.

#### Scenario: Path encodes cliente_id first

- **GIVEN** an object stored for cliente 701, document 42, version 3
- **WHEN** the storage INSERT policy evaluates it
- **THEN** `(storage.foldername(name))[1] = '701'` drives `cliente_visible(701)`.
