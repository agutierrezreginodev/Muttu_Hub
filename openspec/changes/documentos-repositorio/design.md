# Design — Repositorio de documentos (`documentos-repositorio`)

## Architecture Decisions

### Decision 1 — Parent + version-row versioning (NOT a self-superseding chain)

Versions are separate `documento_version` rows under a `documento` parent. Rejected the
"single table + `version` column + `supersedes_id` self-FK" alternative: it forces every
"list current documents" query to filter to chain heads and complicates history reads.
The parent/child split keeps "list documents" = `select from documento` and "version
history" = `select from documento_version where documento_id = …`, and maps one version →
one Storage object cleanly.

### Decision 2 — Current version is DERIVED, not stored (no circular FK)

The parent does NOT carry a `current_version_id`. "Current" = the highest `version` per
document, resolved by `v_documento` via a `lateral` join. This avoids the mutual FK
(`documento.current_version_id` ↔ `documento_version.documento_id`) and its awkward
insert ordering, and there is never a "current pointer is stale" state.

### Decision 3 — `documento_version` is RPC-write-only (mirror `oportunidad_servicio`)

`authenticated` gets SELECT only on `documento_version`; the sole write path is
`private.add_documento_version` (SECURITY DEFINER), which computes the next version
number server-side. This mirrors the established junction posture exactly and keeps the
version sequence un-forgeable by clients.

### Decision 4 — Category access is a role-level grant table + a `categoria_visible` resolver

The 5×5 permission grid is a FIXED, CHECK-constrained jsonb shape (`documentos` module
already present) and CANNOT carry dynamic, catalog-backed categories. Categories are
therefore a SEPARATE axis: `documento_categoria_permiso(rol_id, categoria)`, resolved by
`private.categoria_visible`, structured exactly like `has_permission`. Effective access
= module verb AND category grant AND cliente scope — three orthogonal axes AND-composed
in RLS, the same way `cliente_visible` composes with `has_permission` for CRM.
Role-level only (not user-override) to bound scope; user-override is a future extension
that would only edit the resolver body.

### Decision 5 — Storage `SELECT` policy delegates to `documento_version` RLS (category enforced on bytes without encoding it in the path)

The `storage.objects` SELECT policy for the `documentos` bucket is
`bucket_id = 'documentos' AND EXISTS (select 1 from public.documento_version dv where
dv.storage_path = name)`. Because that `EXISTS` subquery runs as the querying
`authenticated` role, `documento_version`'s own RLS (cliente + `documentos.ver` +
category via the parent) filters it — so the byte layer inherits the FULL composed gate,
including category, WITHOUT category appearing in the object path. This is the
load-bearing trick for "permisos por categoría" at the storage layer.

The upload (INSERT) policy cannot delegate this way (the version row does not exist yet),
so it gates on `cliente_visible((storage.foldername(name))[1]::bigint) +
has_permission('documentos','crear')`. Category is enforced one layer up, at the
metadata insert / `add_documento_version` RPC, before bytes matter. Orphan bytes with no
version row are invisible to every read (the `EXISTS` matches nothing).

### Decision 6 — Byte transport via Route Handlers; metadata mutations via Server Actions

Server Actions cap request bodies at ~1 MB and are awkward for streaming binary. So:
- **Upload** (multipart) and **zip export** (streamed) and **single download**
  (signed-URL redirect) → Next.js **Route Handlers** (`route.ts`, Node runtime).
- **Rename / recategorize / edit description+tags / soft-delete** (small, JSON) →
  **Server Actions** in `src/lib/documentos/actions.ts`, mirroring `src/lib/crm/actions.ts`
  (permission pre-check → zod parse → Supabase write/RPC → `revalidatePath` → action state).

### Decision 7 — Zip via `fflate` streaming in a Node Route Handler; Edge Function is the escape hatch

The zip handler pre-checks `documentos.exportar`, selects visible current versions via
the RLS-gated client, downloads each object (RLS-gated Storage), and streams a zip with
`fflate` (zero-dep, streaming, Node+Edge safe) — no full in-memory archive. Rejected
client-side JSZip (N signed URLs, client memory, no central `exportar` gate). A Supabase
Edge Function is the documented fallback if serverless memory/timeout limits bite on very
large selections. A count/size cap protects the runtime.

### Decision 8 — `categoria_documento` catalog ships empty (unseeded)

Mirrors `tipo_cliente` in PR1: business-approved category codes are a product decision
this change has no authority to invent. The catalog is empty; admin adds real codes. The
FK is MATCH SIMPLE, but `documento.categoria` is NOT NULL, so no document can be created
until at least one category code exists and is granted — the intended behavior.

### Decision 9 — 7th tab reverses the FC8 discipline in the same slice

FC8 deliberately blocked a Documentos tab and `ficha-tabs.test.tsx` ASSERTS its absence.
This change appends Documentos as the 7th `TABS` entry, ships the real
`/crm/[id]/documentos` route in the SAME slice, and rewrites the FC8 test to assert 7
tabs including Documentos (removing the four "no documentos" assertions). Never a dead
link.

## Data Model (proposed DDL sketch — NOT a migration file)

```sql
-- Migration A: category-permission foundation
create table public.documento_categoria_permiso (
  rol_id bigint not null references public.rol(id),
  categoria text not null,
  categoria_cat_tipo text not null default 'categoria_documento'
    check (categoria_cat_tipo = 'categoria_documento'),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  primary key (rol_id, categoria),
  constraint doc_cat_permiso_categoria_fk
    foreign key (categoria_cat_tipo, categoria)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict
);
create index doc_cat_permiso_categoria_idx on public.documento_categoria_permiso(categoria);

create or replace function private.categoria_visible(p_categoria text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.usuario u
    join public.documento_categoria_permiso p on p.rol_id = u.rol_id
    where u.id = (select auth.uid())
      and u.activo and u.deleted_at is null
      and p.categoria = p_categoria
  );
$$;
-- revoke from public,anon; grant execute to authenticated.

-- Migration B: documento + documento_version + v_documento + RPCs + CAT5 extension
create table public.documento (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.cliente(id),
  nombre text not null,
  categoria text not null,
  categoria_cat_tipo text not null default 'categoria_documento'
    check (categoria_cat_tipo = 'categoria_documento'),
  descripcion text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz,
  constraint documento_categoria_fk foreign key (categoria_cat_tipo, categoria)
    references public.catalogo (tipo, codigo) on update restrict on delete restrict,
  constraint documento_id_cliente_uk unique (id, cliente_id)   -- backs version composite FK
);
create index documento_cliente_idx on public.documento(cliente_id) where deleted_at is null;

create table public.documento_version (
  id bigint generated always as identity primary key,
  documento_id bigint not null,
  cliente_id bigint not null,                    -- denormalized RLS input
  version integer not null,
  storage_bucket text not null default 'documentos',
  storage_path text not null unique,
  original_filename text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  uploaded_by uuid references public.usuario(id),
  created_at timestamptz not null default now(),
  unique (documento_id, version),
  constraint documento_version_documento_fk
    foreign key (documento_id, cliente_id)
    references public.documento (id, cliente_id) on delete restrict
);
create index documento_version_documento_idx on public.documento_version(documento_id);
create index documento_version_cliente_idx on public.documento_version(cliente_id);

create view public.v_documento with (security_invoker = true) as
  select d.id, d.cliente_id, d.nombre, d.categoria, d.descripcion, d.tags,
         cur.version as current_version, cur.size_bytes, cur.mime_type,
         cur.original_filename, cur.uploaded_by, cur.created_at as current_uploaded_at,
         d.created_at, d.created_by, d.updated_at, d.updated_by
  from public.documento d
  left join lateral (
    select * from public.documento_version dv
    where dv.documento_id = d.id
    order by dv.version desc limit 1
  ) cur on true
  where d.deleted_at is null;

-- Migration C: storage bucket + storage.objects policies
insert into storage.buckets (id, name, public) values ('documentos','documentos',false)
  on conflict (id) do nothing;
```

## RLS policy shape

```sql
-- documento (all three axes; audit + deleted_at hidden by view)
create policy documento_select on public.documento for select to authenticated
  using (deleted_at is null
     and (select private.cliente_visible(cliente_id))
     and (select private.has_permission('documentos','ver'))
     and (select private.categoria_visible(categoria)));
create policy documento_insert on public.documento for insert to authenticated
  with check ((select private.cliente_visible(cliente_id))
     and (select private.has_permission('documentos','crear'))
     and (select private.categoria_visible(categoria)));
create policy documento_update on public.documento for update to authenticated
  using (deleted_at is null
     and (select private.cliente_visible(cliente_id))
     and (select private.has_permission('documentos','editar'))
     and (select private.categoria_visible(categoria)))          -- old category
  with check (deleted_at is null
     and (select private.cliente_visible(cliente_id))
     and (select private.has_permission('documentos','editar'))
     and (select private.categoria_visible(categoria)));         -- new category

-- documento_version: SELECT derives from parent visibility; no write grant.
create policy documento_version_select on public.documento_version for select to authenticated
  using (exists (select 1 from public.documento d
                 where d.id = documento_id and d.deleted_at is null
                   and (select private.cliente_visible(d.cliente_id))
                   and (select private.has_permission('documentos','ver'))
                   and (select private.categoria_visible(d.categoria))));

-- documento_categoria_permiso: readable by authenticated; writes gated on admin.editar.
create policy doc_cat_permiso_select on public.documento_categoria_permiso
  for select to authenticated using (true);
create policy doc_cat_permiso_insert on public.documento_categoria_permiso
  for insert to authenticated with check ((select private.has_permission('admin','editar')));
create policy doc_cat_permiso_delete on public.documento_categoria_permiso
  for delete to authenticated using ((select private.has_permission('admin','editar')));

-- storage.objects (bucket 'documentos')
create policy documento_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
     and exists (select 1 from public.documento_version dv where dv.storage_path = name));
create policy documento_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos'
     and (select private.cliente_visible(((storage.foldername(name))[1])::bigint))
     and (select private.has_permission('documentos','crear')));
-- no UPDATE/DELETE policy for authenticated on this bucket.
```

RPCs (SECURITY DEFINER, search_path = '', private + public wrapper, mirroring
`set_oportunidad_servicios` / `soft_delete_*`):
- `add_documento_version(p_documento_id, p_storage_path, p_original_filename, p_size_bytes, p_mime_type)`
  → look up documento (cliente_id, categoria, not deleted) → assert `cliente_visible +
  has_permission('documentos','crear') + categoria_visible(categoria)` → insert version
  `coalesce(max(version),0)+1`.
- `soft_delete_documento(p_id)` → assert `cliente_visible + has_permission('documentos',
  'eliminar') + categoria_visible(categoria)` → `update documento set deleted_at = now()`.
- Extend `private.soft_delete_catalogo` with an `EXISTS` branch over non-deleted
  `documento` for `categoria_cat_tipo = p_tipo and categoria = p_codigo` (CAT5).

## Storage layout

- Bucket `documentos`, private. Path `{cliente_id}/{documento_id}/{version}/{filename}`.
- `cliente_id` first so `(storage.foldername(name))[1]` feeds the INSERT policy.
- Single download: server issues `createSignedUrl(path, ttl)` (gated by SELECT policy).
- Upload: Route Handler validates gates on metadata, uploads via the RLS-gated client
  (`storage.from('documentos').upload(path, bytes)` — gated by INSERT policy), then calls
  `add_documento_version`.
- Optional `config.toml` `[storage.buckets.documentos]` block for a mime allow-list /
  per-bucket size (global `file_size_limit = 50MiB` already set).

## Versioning model decision

See Decision 1 + 2 + 3. Chosen: separate `documento_version` rows, derived current
version, RPC-only monotonic numbering. History is intrinsic (rows are never removed by a
new upload); one version = one immutable Storage object.

## Zip-generation decision

See Decision 7. Chosen: Node Route Handler + `fflate` streaming, `documentos.exportar`
pre-check, RLS-gated per-object reads (unauthorized selections silently excluded),
collision-safe entry names, count/size cap; Edge Function as the escape hatch.

## 7th-tab integration (incl. reversing FC8)

1. `ficha-tabs.tsx`: append `{ segment: "documentos", label: es.crm.tabs.documentos }` to
   `TABS`; rewrite the doc-comment that forbids a 7th tab.
2. `ficha-tabs.test.tsx`: change "renders exactly 6" → 7, add "Documentos" to the ordered
   label list, DELETE the two "never renders a Documentos tab/stub" and "never renders a
   /documentos link" assertions (they now assert the opposite).
3. New route `crm/[id]/documentos/page.tsx` (server fetch → client
   `documentos-table.tsx`) ships in the SAME slice as the tab entry.
4. `es.ts`: add `es.crm.tabs.documentos = "Documentos"` + the `es.documentos.*` block.

## Migration Plan (ordered) + pgTAP test names

The CI gate (`scripts/check-migration-tests.sh`) requires each `*_<slug>.sql` migration to
have a `supabase/tests/<slug>_*.sql` test. RED pgTAP is written BEFORE each migration.

1. `<ts>_documentos_categoria_permiso.sql` — grant table + `private.categoria_visible` +
   RLS/grants on the grant table.
   → test: `supabase/tests/documentos_categoria_permiso_rls.sql`
2. `<ts>_documentos_repositorio.sql` — `documento`, `documento_version`, `v_documento`,
   RLS (using `categoria_visible`), grants, `add_documento_version`,
   `soft_delete_documento`, CAT5 extension for `documento.categoria`.
   → test: `supabase/tests/documentos_repositorio_rls.sql`
3. `<ts>_documentos_storage.sql` — bucket `documentos` + `storage.objects` policies
   (SELECT delegates to `documento_version`; INSERT = cliente + crear).
   → test: `supabase/tests/documentos_storage_rls.sql`

## Test Plan

- **pgTAP (RED-first):**
  - *categoria_permiso*: resolver true/false, fail-closed (no auth / inactive user), FK
    rejection, admin-only writes.
  - *documentos_repositorio*: 3-axis SELECT/INSERT/UPDATE matrix across roles; recategorize
    old+new gate; version RPC monotonic numbering + category gate + no direct write grant;
    denormalized `cliente_id` composite-FK anti-drift; `soft_delete_documento` permission
    gate; visibility-follow (soft-delete parent hides versions); CAT5 rejects in-use
    category; `v_documento` is security_invoker + reports the latest version.
  - *documentos_storage*: bucket private; SELECT `EXISTS` delegation (category-denied role
    gets no object); INSERT cliente+crear gate; no UPDATE/DELETE for authenticated.
- **vitest (RTL / unit):** `schemas.test.ts` (zod: name required, category required, tags,
  mime/size); `queries.test.ts` (trust-RLS empty-not-error); `actions.test.ts` (permission
  pre-check + revalidatePath, mocked); `documentos-table.test.tsx` (list, multi-select,
  version-history dialog, edit/delete dialogs); `ficha-tabs.test.tsx` (**7 tabs incl.
  Documentos** — FC8 reversal); zip entry-naming helper unit.
- **Playwright E2E (real local Supabase + Storage):** upload → new version → per-category
  visibility with two roles (granted vs denied) → single download → multi-select zip
  export (allowed with `exportar`, denied without).
