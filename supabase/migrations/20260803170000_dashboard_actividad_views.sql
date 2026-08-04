-- Dashboard Actividad Clientes face aggregation view (dashboard-4-caras PR-3,
-- task 3.2, design.md §4.3, spec dashboard-actividad). `create view` only --
-- no table/column/policy change.
--
-- Security boundary (design.md §1 Decision 1/2): `v_actividad_cliente` is a
-- single `security_invoker = true` UNION view. Each branch reads FROM an
-- existing `security_invoker` view (`v_contacto`, `v_oportunidad` --
-- supabase/migrations/20260728193509_crm_contacto_oportunidad.sql) or the
-- base `bitacora_cliente` table directly (it has no view of its own by
-- design -- supabase/migrations/20260728200200_crm_bitacora.sql). Because
-- `v_actividad_cliente` itself runs under the CALLER's privileges, and every
-- branch's source is ALSO evaluated under that same caller (either directly
-- via `bitacora_cliente_select` RLS, or transitively because `v_contacto`/
-- `v_oportunidad` are themselves `security_invoker` views over
-- `contacto_select`/`oportunidad_select` RLS), every branch resolves through
-- `private.cliente_visible` -> `crm.ver` -- no branch here re-implements
-- that predicate. `v_contacto`/`v_oportunidad` already filter `deleted_at is
-- null`, so soft-deleted contacto/oportunidad rows are excluded for free;
-- `cliente_visible` additionally hides all four event types the instant
-- their `cliente_id` is soft-deleted, even though `bitacora_cliente`/
-- `contacto`/`oportunidad` themselves are never touched (visibility-follow,
-- the same property already pgTAP-proven for contacto/oportunidad in
-- crm_contacto_oportunidad_rls.sql, and re-proven here for this view in
-- dashboard_actividad_views.sql).
--
-- Route gate for the Dashboard surface (`dashboard.ver`) lives at the app
-- layer (`(app)/dashboard/layout.tsx`); this view applies no additional gate
-- of its own -- the underlying domain RLS IS the data gate (design.md §2
-- Decision 3). A `dashboard.ver` holder without `crm.ver` gets zero rows
-- from every branch, never an error.
--
-- `oportunidad_gestion` branch: `fecha_ultima_gestion` is a plain `date`
-- column (design's own DDL), used ONLY as the "has this oportunidad been
-- gestionada at all" filter predicate -- `ocurrido_en` for this branch is
-- `updated_at` (timestamptz), matching design.md §4.3's own sketch exactly.
-- An oportunidad with `fecha_ultima_gestion` set therefore contributes BOTH
-- an `oportunidad_nueva` row (its creation) AND an `oportunidad_gestion` row
-- (its most recent gestion) -- two independent events on the same
-- underlying record, which is the intended UNION semantics, not a
-- duplicate.

create view public.v_actividad_cliente
with (security_invoker = true) as
      select 'bitacora'::text as tipo, b.cliente_id, b.autor_id as actor_id,
             b.texto as detalle, b.created_at as ocurrido_en
        from public.bitacora_cliente b
  union all
      select 'contacto_nuevo', c.cliente_id, c.created_by, c.nombre, c.created_at
        from public.v_contacto c
  union all
      select 'oportunidad_nueva', o.cliente_id, o.created_by, o.nombre, o.created_at
        from public.v_oportunidad o
  union all
      select 'oportunidad_gestion', o.cliente_id, o.updated_by, o.nombre, o.updated_at
        from public.v_oportunidad o
        where o.fecha_ultima_gestion is not null;

revoke all on public.v_actividad_cliente from anon, authenticated;

grant select on public.v_actividad_cliente to authenticated;
grant select on public.v_actividad_cliente to service_role;
