# Spec — document-zip-export

## ADDED Requirements

### Requirement: Multi-select zip export

The system SHALL let a user multi-select documents in the Documentos tab and download
them as a single zip. The selection SHALL be posted to a Route Handler
(`descargar-zip/route.ts`, Node runtime) that streams a zip response. Each selected
document's current version's bytes SHALL be included; documents the caller cannot see
(any authorization axis missing) SHALL be silently excluded, not error the whole export.

#### Scenario: Selected authorized documents are zipped

- **GIVEN** a caller authorized for documents A and B
- **WHEN** they select A and B and trigger "Descargar zip"
- **THEN** a single zip streams containing A's and B's current-version files.

#### Scenario: Unauthorized selections are excluded

- **GIVEN** a caller authorized for A but not C
- **WHEN** they post a selection of [A, C]
- **THEN** the zip contains only A; C is omitted (RLS-gated read returns no row/bytes for C).

#### Scenario: Empty effective selection yields no download

- **GIVEN** a caller who selects only documents they cannot see
- **WHEN** they trigger the export
- **THEN** the handler returns an empty/204-style result, not a corrupt zip.

### Requirement: Zip export is gated on `documentos.exportar`

The zip Route Handler SHALL pre-check `has_permission('documentos','exportar')` via the
caller's RLS-gated client before assembling the archive, and SHALL deny the request when
it is false. (Per-file visibility is still enforced by RLS on the reads; `exportar` gates
the bulk-export capability itself.)

#### Scenario: Export denied without exportar

- **GIVEN** a caller with `documentos.ver` but not `documentos.exportar`
- **WHEN** they trigger the zip export
- **THEN** the handler denies it (no archive is produced).

#### Scenario: Export allowed with exportar

- **GIVEN** a caller with `documentos.exportar` and visibility of the selection
- **WHEN** they trigger the export
- **THEN** the zip streams successfully.

### Requirement: Streaming assembly with bounds

The handler SHALL assemble the zip by streaming (e.g. `fflate`), downloading each object
via the RLS-gated Storage client rather than buffering the entire archive in memory, and
SHALL enforce a maximum selection count and/or total-size bound to protect the serverless
runtime (specific limits — open question). A Supabase Edge Function is the documented
alternative if server-side limits are exceeded.

#### Scenario: Large export does not buffer everything

- **GIVEN** a selection near the size bound
- **WHEN** the zip is produced
- **THEN** bytes stream to the client incrementally (no full in-memory archive).

#### Scenario: Over-limit selection is refused

- **GIVEN** a selection exceeding the configured count/size cap
- **WHEN** it is posted
- **THEN** the handler refuses with a clear error before downloading any bytes.

### Requirement: Zip entry naming avoids collisions

Zip entries SHALL be named to avoid collisions when two selected documents share an
`original_filename` (e.g. prefix with the document id or de-duplicate with a numeric
suffix), so no entry silently overwrites another inside the archive.

#### Scenario: Duplicate filenames both survive

- **GIVEN** documents A and B both named `acta.pdf`
- **WHEN** both are exported together
- **THEN** the zip contains two distinct, non-overwriting entries.
