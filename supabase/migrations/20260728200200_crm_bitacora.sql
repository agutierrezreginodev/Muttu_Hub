-- crm_bitacora (crm-module PR4, §4.2 tab 5): bitacora_cliente, append-only.
-- Source: sdd/crm-module/design (Engram obs #152), Migration Plan #4, DDL
-- section 4, RLS Policies table, Grants section. Spec (obs #151) section
-- crm-bitacora (BIT1-BIT6).
--
-- Mirrors public.registro_acceso (#137 D6 exception), NOT the
-- cliente/tarea/contacto/oportunidad pattern: no audit trigger, no
-- updated_at/updated_by, no deleted_at, no soft-delete RPC. Immutability is
-- enforced at the GRANT layer (no UPDATE/DELETE grant statement is ever
-- written, for anyone) exactly like registro_acceso -- not by RLS policy
-- absence alone. Corrections to an entry are new rows, never edits (BIT5).
--
-- Introduces no new catalog-consuming column, so private.soft_delete_catalogo
-- needs no further CAT5 guard extension in this migration (tracked in
-- tasks/design as an open item to confirm at PR4 apply time -- confirmed:
-- not needed).
--
-- Self-attribution mechanic (autor_id = (select auth.uid()) in the INSERT
-- policy's WITH CHECK): this replicates, byte-for-byte, the existing
-- registro_acceso_insert policy's `usuario_id = (select auth.uid())` check
-- (20260728041925_audit.sql) -- the codebase's own established pattern for
-- "who gets recorded as the actor" on an append-only, no-trigger table. A
-- caller who supplies a mismatched autor_id is rejected (42501), never
-- silently corrected -- same behavior already pgTAP-proven for
-- registro_acceso.usuario_id in audit_security.sql.

-- ---------------------------------------------------------------------------
-- 1. bitacora_cliente: append-only entity note. bigint identity PK,
--    cliente_id FK, autor_id FK (not null, no default -- caller/action code
--    supplies it explicitly, RLS enforces it can only be their own uid,
--    exactly as registro_acceso.usuario_id already works), texto with a
--    non-blank CHECK, created_at only.
-- ---------------------------------------------------------------------------
create table public.bitacora_cliente (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.cliente(id),
  autor_id uuid not null references public.usuario(id),
  texto text not null check (length(btrim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index bitacora_cliente_idx on public.bitacora_cliente(cliente_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS enabled + FORCED.
-- ---------------------------------------------------------------------------
alter table public.bitacora_cliente enable row level security;
alter table public.bitacora_cliente force row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants: SELECT + INSERT only, for authenticated AND service_role. No
--    UPDATE/DELETE grant statement is written at all -- this is the actual
--    immutability mechanism (same as registro_acceso), not merely a policy
--    gap. Supabase default privileges grant ALL to anon/authenticated on new
--    public tables, so revoke first.
-- ---------------------------------------------------------------------------
revoke all on public.bitacora_cliente from anon, authenticated;
grant select, insert on public.bitacora_cliente to authenticated;
grant select, insert on public.bitacora_cliente to service_role;

-- ---------------------------------------------------------------------------
-- 4. Policies (helper calls wrapped in (select ...) per the RLS perf rule).
--    SELECT: any crm.ver holder sees every entry for every visible cliente,
--    no per-author restriction (Decision 5 / BIT3). INSERT: any crm.crear
--    holder may write to ANY visible cliente's bitacora -- no
--    responsable_interno/ownership gate (Decision 5 / BIT4) -- author pinned
--    to the caller via autor_id = (select auth.uid()).
-- ---------------------------------------------------------------------------
create policy bitacora_cliente_select on public.bitacora_cliente
  for select to authenticated
  using ((select private.cliente_visible(cliente_id)));

create policy bitacora_cliente_insert on public.bitacora_cliente
  for insert to authenticated
  with check (
    (select private.cliente_visible(cliente_id))
    and (select private.has_permission('crm', 'crear'))
    and autor_id = (select auth.uid())
  );

-- No UPDATE/DELETE policy -- there is no grant for either statement to attach
-- to, so none is needed (matches registro_acceso exactly).
-- No view is created -- registro_acceso has none either (design DDL section 4).
