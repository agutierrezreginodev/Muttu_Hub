-- pgTAP: crm_cliente_ext migration (crm-module PR2, §4.2 General tab): 9 new
-- `cliente` columns, their additive column-level UPDATE grants (authenticated
-- AND service_role), the 4 pinned-discriminator catalog FKs among them, the
-- `v_cliente` rebuild, and the required extension of
-- `private.soft_delete_catalogo`'s CAT5 referential guard to the new
-- catalog-consuming columns.
-- Source: sdd/crm-module/design (Engram obs #152), Decision 7's Open
-- Question note ("PR2 ... MUST extend this function's guard when they add
-- more catalog-consuming columns"). Covers PR2 task 2.2.
--
-- Column-to-type map (design DDL, verbatim — no ambiguity, fully specified):
--   empresa                    text            plain
--   tamano_organizacion        text            catalog FK (tipo 'tamano_organizacion')
--   ubicacion                  text            plain
--   canal_contacto_inicial     text            catalog FK (tipo 'canal_contacto')
--   fecha_primer_contacto      date            plain
--   prioridad                  text            catalog FK (tipo 'prioridad' -- SAME
--                                               tipo as tarea.prioridad, already seeded
--                                               Alta/Media/Baja by PR1)
--   nivel_madurez               text            catalog FK (tipo 'nivel_madurez')
--   prioridades_identificadas  text            plain
--   riesgos_barreras           text            plain
--
-- FC2/FC3 (the proposal's HIGH-likelihood-failure risk): every one of the 9
-- columns MUST be reachable by BOTH grant lists. This file asserts each
-- column individually rather than compressing into a loop or a single
-- combined UPDATE, so a single omitted column fails CI instead of hiding
-- inside an aggregate result.

begin;

select plan(32);

-- Fixtures (superuser, bypasses RLS/grants entirely).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- The 3 brand-new catalog tipos here have zero business-approved codes yet
-- (same Open Question as tipo_cliente in PR1) -- seed one throwaway code per
-- tipo, superuser/local to this rolled-back transaction, so the FK-accepting
-- path can be exercised for real instead of only asserting the NULL case.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('tamano_organizacion', 'pyme', 'PyME', 1),
  ('canal_contacto', 'referido', 'Referido', 1),
  ('nivel_madurez', 'inicial', 'Inicial', 1)
on conflict (tipo, codigo) do nothing;

insert into public.cliente (id, nombre, estado) overriding system value values
  (501, 'Cliente Ext Uno', 'activo'),
  (502, 'Cliente Ext Borrado', 'activo');
update public.cliente set deleted_at = now() where id = 502;

insert into public.tarea (id, titulo, origen, estado, responsable_id, cliente_id, prioridad)
overriding system value values
  (601, 'Tarea Ext Uno', 'CRM', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 501, null);

-- ---------------------------------------------------------------------------
-- 1-9: FC3(a) -- authenticated user holding crm.editar (Coordinador) can
-- UPDATE every one of the 9 new columns.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$update public.cliente set empresa = 'Acme SA' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.empresa');

select lives_ok(
  $$update public.cliente set tamano_organizacion = 'pyme' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.tamano_organizacion');

select lives_ok(
  $$update public.cliente set ubicacion = 'Bogota' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.ubicacion');

select lives_ok(
  $$update public.cliente set canal_contacto_inicial = 'referido' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.canal_contacto_inicial');

select lives_ok(
  $$update public.cliente set fecha_primer_contacto = current_date where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.fecha_primer_contacto');

select lives_ok(
  $$update public.cliente set prioridad = 'Alta' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.prioridad');

select lives_ok(
  $$update public.cliente set nivel_madurez = 'inicial' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.nivel_madurez');

select lives_ok(
  $$update public.cliente set prioridades_identificadas = 'Optimizar procesos' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.prioridades_identificadas');

select lives_ok(
  $$update public.cliente set riesgos_barreras = 'Presupuesto limitado' where id = 501$$,
  'authenticated (crm.editar) can UPDATE cliente.riesgos_barreras');

reset role;

-- ---------------------------------------------------------------------------
-- 10-11: negative control -- Colaborador (crm.editar = false) is denied on a
-- sample of the 9 columns (RLS silently filters the row: 0 rows updated, not
-- an error -- same shape as the existing cliente_update policy).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

with u as (update public.cliente set empresa = 'Intruso SA' where id = 501 returning 1)
select ok((select count(*) = 0 from u),
  'colaborador (no crm.editar) cannot UPDATE cliente.empresa');

with u as (update public.cliente set tamano_organizacion = 'pyme' where id = 501 returning 1)
select ok((select count(*) = 0 from u),
  'colaborador (no crm.editar) cannot UPDATE cliente.tamano_organizacion');

reset role;

-- ---------------------------------------------------------------------------
-- 12-20: FC3(b) -- service_role can UPDATE every one of the 9 new columns
-- (service_role bypasses RLS but not grants).
-- ---------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  $$update public.cliente set empresa = 'Acme SA (svc)' where id = 501$$,
  'service_role can UPDATE cliente.empresa');

select lives_ok(
  $$update public.cliente set tamano_organizacion = 'pyme' where id = 501$$,
  'service_role can UPDATE cliente.tamano_organizacion');

select lives_ok(
  $$update public.cliente set ubicacion = 'Medellin' where id = 501$$,
  'service_role can UPDATE cliente.ubicacion');

select lives_ok(
  $$update public.cliente set canal_contacto_inicial = 'referido' where id = 501$$,
  'service_role can UPDATE cliente.canal_contacto_inicial');

select lives_ok(
  $$update public.cliente set fecha_primer_contacto = current_date where id = 501$$,
  'service_role can UPDATE cliente.fecha_primer_contacto');

select lives_ok(
  $$update public.cliente set prioridad = 'Media' where id = 501$$,
  'service_role can UPDATE cliente.prioridad');

select lives_ok(
  $$update public.cliente set nivel_madurez = 'inicial' where id = 501$$,
  'service_role can UPDATE cliente.nivel_madurez');

select lives_ok(
  $$update public.cliente set prioridades_identificadas = 'Expandir cobertura' where id = 501$$,
  'service_role can UPDATE cliente.prioridades_identificadas');

select lives_ok(
  $$update public.cliente set riesgos_barreras = 'Rotacion de personal' where id = 501$$,
  'service_role can UPDATE cliente.riesgos_barreras');

reset role;

-- ---------------------------------------------------------------------------
-- 21-24: discriminators are excluded from every grant list -- direct UPDATE
-- rejected at the grant layer, even for administrador.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$update public.cliente set tamano_organizacion_cat_tipo = 'bogus' where id = 501$$,
  '42501', null, 'cliente.tamano_organizacion_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

select throws_ok(
  $$update public.cliente set canal_contacto_inicial_cat_tipo = 'bogus' where id = 501$$,
  '42501', null, 'cliente.canal_contacto_inicial_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

select throws_ok(
  $$update public.cliente set prioridad_cat_tipo = 'bogus' where id = 501$$,
  '42501', null, 'cliente.prioridad_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

select throws_ok(
  $$update public.cliente set nivel_madurez_cat_tipo = 'bogus' where id = 501$$,
  '42501', null, 'cliente.nivel_madurez_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

reset role;

-- ---------------------------------------------------------------------------
-- 25-28: catalog FK rejects an unlisted code for each of the 4 new
-- catalog-consuming columns (superuser -- bypasses grant, reaches the FK).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.cliente set tamano_organizacion = 'no-existe' where id = 501$$,
  '23503', null, 'cliente.tamano_organizacion FK rejects an unlisted code');

select throws_ok(
  $$update public.cliente set canal_contacto_inicial = 'no-existe' where id = 501$$,
  '23503', null, 'cliente.canal_contacto_inicial FK rejects an unlisted code');

select throws_ok(
  $$update public.cliente set prioridad = 'no-existe' where id = 501$$,
  '23503', null, 'cliente.prioridad FK rejects an unlisted code');

select throws_ok(
  $$update public.cliente set nivel_madurez = 'no-existe' where id = 501$$,
  '23503', null, 'cliente.nivel_madurez FK rejects an unlisted code');

-- ---------------------------------------------------------------------------
-- 29-30: v_cliente exposes the 9 new columns and still filters
-- deleted_at is null.
-- ---------------------------------------------------------------------------
select is(
  (select row(empresa, tamano_organizacion, ubicacion, canal_contacto_inicial,
              fecha_primer_contacto, prioridad, nivel_madurez,
              prioridades_identificadas, riesgos_barreras)
     from public.v_cliente where id = 501),
  (select row(empresa, tamano_organizacion, ubicacion, canal_contacto_inicial,
              fecha_primer_contacto, prioridad, nivel_madurez,
              prioridades_identificadas, riesgos_barreras)
     from public.cliente where id = 501),
  'v_cliente exposes all 9 new columns matching the base table');

select ok((select count(*) = 0 from public.v_cliente where id = 502),
  'v_cliente still hides soft-deleted cliente rows');

-- ---------------------------------------------------------------------------
-- 31-32: soft_delete_catalogo's CAT5 guard is extended to the new
-- catalog-consuming columns (design Decision 7's Open Question -- PR2 MUST
-- extend this function, not just add columns/grants).
-- cliente.prioridad shares the 'prioridad' tipo with tarea.prioridad (already
-- guarded since PR1); 'Media' is in use by cliente 501 (test 20 above) so the
-- guard must reject deactivating it even though no tarea row references it.
-- 'pyme' (tamano_organizacion) is in use by cliente 501 (test 2/15 above).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$select public.soft_delete_catalogo('tamano_organizacion', 'pyme')$$,
  '23503', null,
  'soft_delete_catalogo guard extended: rejects deactivating a tamano_organizacion code in use by cliente');

select throws_ok(
  $$select public.soft_delete_catalogo('prioridad', 'Media')$$,
  '23503', null,
  'soft_delete_catalogo guard extended: rejects deactivating a prioridad code in use by cliente.prioridad (not just tarea.prioridad)');

reset role;

select * from finish();

rollback;
