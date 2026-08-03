# Spec — document-versioning

## ADDED Requirements

### Requirement: Parent + version-row model

The system SHALL model versions as separate `public.documento_version` rows under a
`public.documento` parent (NOT a single self-superseding table). Each
`documento_version` SHALL carry: `documento_id` (FK), `cliente_id` (denormalized, part
of a composite FK to `documento(id, cliente_id)` so it cannot drift — same shape as
`oportunidad_servicio`), a monotonic `version` integer, `storage_bucket`,
`storage_path` (UNIQUE), `original_filename`, `size_bytes` (`>= 0`), `mime_type`,
`uploaded_by` (FK `usuario`), and `created_at`. `unique(documento_id, version)` SHALL
hold.

The "current version" SHALL be DERIVED as the highest `version` per `documento` (exposed
by `v_documento` via a lateral join), NOT stored as a `current_version_id` column —
this avoids a circular FK between parent and version.

#### Scenario: Versions are separate rows

- **GIVEN** document 42 with two uploads
- **WHEN** its versions are inspected
- **THEN** two `documento_version` rows exist with `version` 1 and 2, both retained.

#### Scenario: Denormalized cliente_id cannot drift

- **GIVEN** document 42 belongs to cliente 701
- **WHEN** a version row is inserted with `cliente_id = 702`
- **THEN** the composite FK to `documento(id, cliente_id)` rejects it (`23503`).

#### Scenario: Current version is the highest version

- **GIVEN** document 42 has versions 1, 2, 3
- **WHEN** `v_documento` is read
- **THEN** it reports version 3's size/mime/path/uploader as the current attributes.

### Requirement: Monotonic version numbering via RPC-only write path

The system SHALL create version rows ONLY through
`public.add_documento_version(p_documento_id, p_storage_path, p_original_filename,
p_size_bytes, p_mime_type)` (SECURITY DEFINER), which computes the next version as
`coalesce(max(version), 0) + 1` for that document. `authenticated` SHALL NOT hold
INSERT/UPDATE/DELETE on `documento_version` (SELECT only) — exactly the
`oportunidad_servicio` posture. The RPC SHALL enforce `cliente_visible` +
`has_permission('documentos','crear')` + `categoria_visible(documento.categoria)` before
inserting.

#### Scenario: Adding a version increments the number

- **GIVEN** document 42 at version 2
- **WHEN** `add_documento_version` is called for it
- **THEN** a row with `version = 3` is inserted and versions 1 and 2 remain unchanged.

#### Scenario: No direct write grant on versions

- **GIVEN** any authenticated role
- **WHEN** it runs `INSERT`/`UPDATE`/`DELETE` directly on `documento_version`
- **THEN** it is rejected at the grant layer (`42501`); the RPC is the only write path.

#### Scenario: Version add is category-gated

- **GIVEN** a caller lacking a grant on document 42's category
- **WHEN** they call `add_documento_version(42, …)`
- **THEN** it raises `42501` (`categoria_visible` false) and no version is added.

#### Scenario: Concurrent uploads do not collide silently

- **GIVEN** two uploads racing to add a version to document 42 at version 2
- **WHEN** both compute `version = 3`
- **THEN** `unique(documento_id, version)` rejects the loser (`23505`); the caller retries.

### Requirement: Version history is retained and viewable

The system SHALL retain every version indefinitely (no version is overwritten or
deleted by a new upload) and SHALL expose a version-history listing per document
(version number, filename, size, mime, uploader, timestamp), each historic version
downloadable subject to the same authorization gate as the current version.

#### Scenario: History lists all versions newest-first

- **GIVEN** document 42 with versions 1..3
- **WHEN** its history is listed
- **THEN** all three versions appear, newest first, with their own physical attributes.

#### Scenario: Historic version is downloadable

- **GIVEN** an authorized caller viewing version 1 of document 42
- **WHEN** they download version 1
- **THEN** the version-1 object is served (not silently redirected to the current one).

### Requirement: Version visibility follows the parent

A `documento_version` SHALL be visible only when its parent `documento` is visible
(cliente visible + `documentos.ver` + category granted + parent not soft-deleted). The
version SELECT policy SHALL derive visibility from the parent, not re-encode the axes.

#### Scenario: Soft-deleting the parent hides its versions

- **GIVEN** document 42 with visible versions
- **WHEN** the parent `documento` is soft-deleted
- **THEN** its `documento_version` rows become invisible to every read path, without
  touching the version rows themselves.
