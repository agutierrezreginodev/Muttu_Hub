# Spec — document-permissions

## ADDED Requirements

### Requirement: Category access is a role-level grant

The system SHALL gate document access per **category** via a
`public.documento_categoria_permiso(rol_id, categoria, categoria_cat_tipo)` table:
a row grants a role access to a `categoria_documento` category. `categoria` SHALL be a
composite FK to `catalogo(tipo, codigo)` under tipo `categoria_documento`. Absence of a
row SHALL mean **no access** (fail-closed). Category access SHALL be role-level only in
this change (`usuario.permisos_override` is not extended for categories).

#### Scenario: Grant present enables the category axis

- **GIVEN** role R has a grant on category `contratos`
- **WHEN** a user with role R is authorization-checked for a `contratos` document
- **THEN** the category axis passes for that user.

#### Scenario: No grant means no access (fail-closed)

- **GIVEN** role R has no grant on category `legal`
- **WHEN** a user with role R is authorization-checked for a `legal` document
- **THEN** the category axis fails.

#### Scenario: Grants reference a real catalog code

- **WHEN** a grant is written for `categoria = 'inexistente'`
- **THEN** the composite FK to `catalogo` rejects it (`23503`).

### Requirement: `private.categoria_visible` resolver

The system SHALL provide `private.categoria_visible(p_categoria text) returns boolean`,
`STABLE`, `SECURITY DEFINER`, `set search_path = ''`, structured like
`private.has_permission`: it SHALL return true iff the current user
(`(select auth.uid())`, active, not deleted) has a role holding a
`documento_categoria_permiso` row for `p_categoria`. It SHALL be granted EXECUTE to
`authenticated` only (revoked from `public`, `anon`) and SHALL be called wrapped in
`(select …)` in every policy, per the RLS performance rule.

#### Scenario: Resolver is fail-closed for an unknown user

- **GIVEN** a request with no valid `auth.uid()`
- **WHEN** `categoria_visible('contratos')` is evaluated
- **THEN** it returns false (no matching usuario row).

#### Scenario: Deactivated user loses category access

- **GIVEN** a user whose `usuario.activo` is false
- **WHEN** `categoria_visible` is evaluated for any of their role's granted categories
- **THEN** it returns false.

### Requirement: RLS composes category × module verb × cliente scope

Every `documento` policy SHALL AND-compose three orthogonal axes:
`(select private.cliente_visible(cliente_id))`,
`(select private.has_permission('documentos', <verb>))`, and
`(select private.categoria_visible(categoria))`, with `deleted_at is null` on read/update.
The verb SHALL be `ver` (SELECT), `crear` (INSERT), `editar` (UPDATE). For UPDATE, the
USING clause SHALL check `categoria_visible(old category)` and WITH CHECK
`categoria_visible(new category)`.

#### Scenario: Missing any single axis denies

- **GIVEN** a user with `documentos.ver` + `cliente_visible` but NO grant on the document's category
- **WHEN** they SELECT that document
- **THEN** the row is invisible (category axis false).

#### Scenario: All three axes required for insert

- **GIVEN** a user with `documentos.crear` + category grant but NOT `cliente_visible` for the target cliente
- **WHEN** they insert a `documento`
- **THEN** RLS rejects it (`42501`).

#### Scenario: Recategorize is gated on both old and new category

- **GIVEN** a user granted `contratos` but not `legal`
- **WHEN** they UPDATE a `contratos` document's category to `legal`
- **THEN** WITH CHECK `categoria_visible('legal')` fails and the update is rejected.

### Requirement: Storage layer inherits the metadata gate

The `storage.objects` SELECT policy for the `documentos` bucket SHALL delegate
visibility to `documento_version` RLS via `EXISTS (select 1 from
public.documento_version dv where dv.storage_path = storage.objects.name)`, so a caller
can read an object ONLY if they can see its version row — which already encodes cliente
scope + `documentos.ver` + category. The storage INSERT policy (upload) SHALL gate on
`cliente_visible((storage.foldername(name))[1]::bigint)` +
`has_permission('documentos','crear')` (category is enforced at the metadata insert,
since the path does not encode category). No UPDATE/DELETE policy on `storage.objects`
SHALL be granted for this bucket to `authenticated`.

#### Scenario: Category-denied role cannot mint a signed URL

- **GIVEN** a user without a grant on document 42's category
- **WHEN** they request a signed URL for version 3's object
- **THEN** the storage SELECT policy's `EXISTS` finds no visible version row and access
  is denied — no URL is issued.

#### Scenario: Upload path is cliente- and crear-gated at the storage layer

- **GIVEN** a user without `cliente_visible(701)`
- **WHEN** they attempt to upload an object under `701/…`
- **THEN** the storage INSERT policy denies it (`cliente_visible` false).

#### Scenario: Orphan bytes without a version row are invisible

- **GIVEN** bytes uploaded to storage but no `documento_version` referencing them
- **WHEN** any caller lists or signs that object
- **THEN** the SELECT policy's `EXISTS` matches nothing and the object is inaccessible.

### Requirement: Category catalog is CAT5-guarded

`private.soft_delete_catalogo` SHALL be extended to reject deactivating a
`categoria_documento` code still referenced by any non-deleted `documento`, raising
`23503`, exactly as PR3 extended it for `perfil_decision` / `estado_oportunidad` /
`servicio_interes`.

#### Scenario: In-use category cannot be deactivated

- **GIVEN** category `contratos` is used by a non-deleted `documento`
- **WHEN** an admin calls `soft_delete_catalogo('categoria_documento','contratos')`
- **THEN** it raises `23503` and `activo` stays true.

#### Scenario: Unused category can be deactivated

- **GIVEN** category `borrador_tmp` referenced by no non-deleted `documento`
- **WHEN** an admin deactivates it
- **THEN** `activo` flips to false.

### Requirement: Admin manages category grants

The system SHALL provide an admin surface (gated on the `admin` module) to grant/revoke
categories to roles by writing `documento_categoria_permiso`. Reads of the grant table
SHALL be available to `authenticated` (needed for the admin editor); writes SHALL be
gated on `admin.editar` (INSERT/DELETE), mirroring how `catalogo`/`rol` writes are gated.

#### Scenario: Admin grants a category to a role

- **GIVEN** an admin with `admin.editar`
- **WHEN** they grant `contratos` to role Coordinador
- **THEN** a `documento_categoria_permiso` row is created and Coordinador users gain the axis.

#### Scenario: Non-admin cannot change grants

- **GIVEN** a user without `admin.editar`
- **WHEN** they attempt to insert/delete a grant
- **THEN** RLS rejects it (`42501`).
