-- kanban_comentario (kanban-module slice 2, §5.2 — comment thread): append-only
-- tarea_comentario.
-- Source: sdd/kanban-module/design (Engram obs #176 §4, D7/D8), spec (obs #174,
-- KM1-KM4), tasks (obs #179, slice 2).
--
-- Mirrors public.bitacora_cliente (20260728200200_crm_bitacora.sql)
-- STRUCTURALLY, byte-for-byte in shape: no audit trigger, no
-- updated_at/updated_by, no deleted_at, no soft-delete RPC. Immutability is
-- enforced at the GRANT layer (no UPDATE/DELETE grant statement is ever
-- written, for anyone) -- not by RLS policy absence alone.
--
-- Visibility/authorship model differs from bitacora_cliente only in WHICH
-- resolver is called: private.tarea_visible(tarea_id) (the origen-aware seam
-- from private.tarea_origen_permite, kanban-module slice 1a) replaces
-- private.cliente_visible(cliente_id). INSERT additionally requires the
-- origen-appropriate 'crear' permission via tarea_origen_permite(tarea_id,
-- 'crear') -- both 'ver' and 'crear' are required, deliberately (D7): a
-- holder of kanban.crear without kanban.ver must not be able to write onto a
-- row it cannot read.
--
-- Introduces no new catalog-consuming column, so private.soft_delete_catalogo
-- needs no further CAT5 extension in this migration.

-- ---------------------------------------------------------------------------
-- 1. tarea_comentario: append-only comment. bigint identity PK, tarea_id FK
--    (not null), autor_id FK (not null, no default -- caller/action code
--    supplies it explicitly, RLS enforces it can only be their own uid,
--    exactly as bitacora_cliente.autor_id / registro_acceso.usuario_id
--    already work), texto with a non-blank CHECK, created_at only.
-- ---------------------------------------------------------------------------
create table public.tarea_comentario (
  id bigint generated always as identity primary key,
  tarea_id bigint not null references public.tarea(id),
  autor_id uuid not null references public.usuario(id),
  texto text not null check (length(btrim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index tarea_comentario_idx on public.tarea_comentario(tarea_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS enabled + FORCED.
-- ---------------------------------------------------------------------------
alter table public.tarea_comentario enable row level security;
alter table public.tarea_comentario force row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants: SELECT + INSERT only, for authenticated AND service_role. No
--    UPDATE/DELETE grant statement is written at all -- this is the actual
--    immutability mechanism (same as bitacora_cliente/registro_acceso), not
--    merely a policy gap. Supabase default privileges grant ALL to
--    anon/authenticated on new public tables, so revoke first.
-- ---------------------------------------------------------------------------
revoke all on public.tarea_comentario from anon, authenticated;
grant select, insert on public.tarea_comentario to authenticated;
grant select, insert on public.tarea_comentario to service_role;

-- ---------------------------------------------------------------------------
-- 4. Policies (helper calls wrapped in (select ...) per the RLS perf rule).
--    SELECT: private.tarea_visible(tarea_id) (KC8/D7 seam) -- no per-author
--    restriction, anyone who can see the tarea sees every comment on it
--    (mirrors bitacora's BIT3-equivalent). INSERT: private.tarea_visible AND
--    the origen-appropriate 'crear' permission (BOTH required, deliberately
--    -- D7), author pinned to the caller via
--    autor_id = (select auth.uid()), exactly as bitacora_cliente_insert and
--    registro_acceso_insert already do.
-- ---------------------------------------------------------------------------
create policy tarea_comentario_select on public.tarea_comentario
  for select to authenticated
  using ((select private.tarea_visible(tarea_id)));

create policy tarea_comentario_insert on public.tarea_comentario
  for insert to authenticated
  with check (
    (select private.tarea_visible(tarea_id))
    and (select private.tarea_origen_permite(tarea_id, 'crear'))
    and autor_id = (select auth.uid())
  );

-- No UPDATE/DELETE policy -- there is no grant for either statement to attach
-- to, so none is needed (matches bitacora_cliente/registro_acceso exactly).
-- No view is created -- bitacora_cliente has none either.
