-- pgTAP: service_role INSERT grant on documento_categoria_permiso
-- (20260803090000_documento_categoria_permiso_service_role_insert.sql).
--
-- The original migration 20260730120000_documentos_categoria_permiso.sql
-- granted service_role SELECT only on the grant table, omitting INSERT.
-- service_role has rolbypassrls=true (skips RLS policies) but BYPASSRLS
-- does NOT skip ordinary table-privilege checks -- GRANTs are still
-- required (the same class of gap 20260728050000_service_role_grants.sql
-- closed for the 5 base tables). This file proves the follow-up INSERT
-- grant is present and that service_role can now seed a grant row, the
-- exact path the e2e documentos fixture (ensureGrant) and any future
-- server-side admin script rely on. service_role still has no DELETE
-- grant (intentional -- the table's own doc_cat_permiso_delete policy
-- gates deletes for authenticated; service_role DELETE would bypass
-- that, so it stays revoked).

begin;

select plan(2);

-- Test-local catalog code required by the composite FK on
-- documento_categoria_permiso (categoria_cat_tipo, categoria) -> catalogo
-- (tipo, codigo). Inserted as superuser (before the role switch), same
-- pattern as documentos_categoria_permiso_rls.sql's fixture block.
-- Decision 8 keeps the real catalog empty; this row is rolled back with
-- the rest of the transaction at end-of-test.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('categoria_documento', 'svc-role-probe', 'Service Role Probe', 99);

set local role service_role;

-- 1: the follow-up grant lets service_role INSERT a grant row.
select lives_ok(
  $$insert into public.documento_categoria_permiso (rol_id, categoria) values
     ((select id from public.rol where nombre = 'Gerencia'), 'svc-role-probe')$$,
  'service_role can INSERT into documento_categoria_permiso after the follow-up grant');

-- 2: service_role still cannot DELETE (no DELETE grant on this table for
-- service_role, intentional -- leaves row removal under the
-- doc_cat_permiso_delete RLS policy for authenticated admin.editar).
select throws_ok(
  $$delete from public.documento_categoria_permiso
    where rol_id = (select id from public.rol where nombre = 'Gerencia')
      and categoria = 'svc-role-probe'$$,
  '42501', null,
  'service_role cannot DELETE documento_categoria_permiso (no DELETE grant -- deletes stay admin-gated)');

reset role;

select * from finish();

rollback;