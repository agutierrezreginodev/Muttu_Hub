-- pgTAP: crm_contacto_oportunidad migration (crm-module PR3, §4.2 tabs 2-3):
-- private.cliente_visible() resolver, contacto, oportunidad,
-- oportunidad_servicio junction, soft-delete RPCs, set_oportunidad_servicios,
-- and the required extension of private.soft_delete_catalogo's CAT5 guard.
-- Source: sdd/crm-module/design (Engram obs #152), spec (obs #151) sections
-- crm-ficha-cliente (FC5), crm-contactos (CO1-CO6), crm-oportunidades
-- (OP1-OP5). Covers PR3 tasks 3.2/3.10.
--
-- Judgment call disclosed: oportunidad.estado is `not null default 'abierta'`
-- per the design's own DDL, which requires a matching catalogo row to exist
-- for ANY bare insert to succeed in ANY environment (not just this test) --
-- unlike PR1's tipo_cliente (nullable, so unseeded = schema-safe), a NOT NULL
-- DEFAULT with an FK is non-functional without its referent. The migration
-- therefore seeds exactly one row, ('estado_oportunidad','abierta','Abierta'),
-- matching the literal string the design DDL already committed to -- not a
-- new business decision, just making the shipped default work. All other new
-- tipos (perfil_decision, servicio_interes, and any other estado_oportunidad
-- codes) remain unseeded business decisions, per the Open Question.

begin;

select plan(59);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'gerencia@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'coord@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'colab@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'sinver@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('11111111-1111-1111-1111-111111111111', 'Admin', 'admin@test.local',
   (select id from public.rol where nombre = 'Administrador')),
  ('22222222-2222-2222-2222-222222222222', 'Gerencia', 'gerencia@test.local',
   (select id from public.rol where nombre = 'Gerencia')),
  ('44444444-4444-4444-4444-444444444444', 'Coordinador', 'coord@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('55555555-5555-5555-5555-555555555555', 'Colaborador', 'colab@test.local',
   (select id from public.rol where nombre = 'Colaborador')),
  ('66666666-6666-6666-6666-666666666666', 'Sin Ver', 'sinver@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Colaborador role has crm.ver=true; force this ONE user's effective crm.ver
-- to false via permisos_override (has_permission's override key beats the
-- role) so "cliente_visible false without crm.ver" is a real, exercised path.
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '66666666-6666-6666-6666-666666666666';

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- 2 new catalog tipos have zero business-approved codes yet (same Open
-- Question as tipo_cliente/tamano_organizacion/etc in PR1/PR2) -- seed
-- throwaway codes, superuser/local to this rolled-back transaction, so the
-- FK-accepting and set-replacement paths can be exercised for real.
insert into public.catalogo (tipo, codigo, etiqueta, orden) values
  ('perfil_decision', 'decisor', 'Decisor', 1),
  ('estado_oportunidad', 'ganada', 'Ganada', 2),
  ('servicio_interes', 'consultoria', 'Consultoria', 1),
  ('servicio_interes', 'capacitacion', 'Capacitacion', 2),
  ('servicio_interes', 'implementacion', 'Implementacion', 3)
on conflict (tipo, codigo) do nothing;

insert into public.cliente (id, nombre, estado) overriding system value values
  (701, 'Cliente Visible', 'activo'),
  (702, 'Cliente Ya Borrado', 'activo'),
  (703, 'Cliente Visibility Follow', 'activo');
update public.cliente set deleted_at = now() where id = 702;

-- Fixed-id fixture rows (superuser bypass) used across later role-scoped
-- assertions.
insert into public.contacto (id, cliente_id, nombre) overriding system value values
  (800, 701, 'Contacto Base');
insert into public.contacto (id, cliente_id, nombre) overriding system value values
  (801, 703, 'Contacto Visibility Follow');

insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (900, 701, 'Oportunidad Base');
insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (902, 703, 'Oportunidad Visibility Follow');

-- ---------------------------------------------------------------------------
-- 1-4: private.cliente_visible() direct behavior (FC5, the single seam).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select ok((select private.cliente_visible(701)),
  'cliente_visible true: crm.ver holder + cliente exists + not deleted');

select ok(not (select private.cliente_visible(702)),
  'cliente_visible false: cliente soft-deleted');

select ok(not (select private.cliente_visible(999999)),
  'cliente_visible false: cliente does not exist');

set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666"}';

select ok(not (select private.cliente_visible(701)),
  'cliente_visible false: caller lacks crm.ver even though cliente exists and is not deleted');

reset role;

-- ---------------------------------------------------------------------------
-- 5-9: contacto RLS as Gerencia (crm.ver only).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.contacto where id = 800),
  'gerencia can SELECT contacto tied to a visible cliente');

select ok((select count(*) = 0 from public.contacto where cliente_id = 702),
  'contacto tied to a soft-deleted cliente is invisible (cliente_visible = false)');

select throws_ok(
  $$insert into public.contacto (cliente_id, nombre) values (701, 'Intruso')$$,
  '42501', null, 'gerencia cannot INSERT contacto (crm.crear required)');

with u as (update public.contacto set notas = 'x' where id = 800 returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE contacto (crm.editar required)');

select throws_ok(
  $$delete from public.contacto where id = 800$$,
  '42501', null, 'no DELETE grant on contacto for authenticated (grant layer, any role)');

reset role;

-- ---------------------------------------------------------------------------
-- 10-12: contacto as Coordinador (crear/editar). Also proves audit_fields()
-- populates created_by with zero app-code involvement.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

with i as (
  insert into public.contacto (cliente_id, nombre) values (701, 'Contacto Coord')
  returning created_by
)
select is((select created_by from i), '44444444-4444-4444-4444-444444444444'::uuid,
  'audit_fields() sets contacto.created_by from auth.uid(), no app code involved');

with u as (update public.contacto set notas = 'gestionado' where id = 800 returning 1)
select ok((select count(*) = 1 from u),
  'coordinador can UPDATE contacto (crm.editar)');

select throws_ok(
  $$update public.contacto set perfil_decision = 'no-existe' where id = 800$$,
  '23503', null, 'contacto.perfil_decision FK rejects an unlisted code');

reset role;

-- ---------------------------------------------------------------------------
-- 13-14: contacto as Colaborador (crear but not editar).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select lives_ok(
  $$insert into public.contacto (cliente_id, nombre) values (701, 'Contacto Colab')$$,
  'colaborador can INSERT contacto (crm.crear)');

with u as (update public.contacto set notas = 'x' where id = 800 returning 1)
select ok((select count(*) = 0 from u),
  'colaborador cannot UPDATE contacto (crm.editar seeded false)');

reset role;

-- ---------------------------------------------------------------------------
-- 15-16: perfil_decision_cat_tipo discriminator excluded from every grant.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$update public.contacto set perfil_decision_cat_tipo = 'bogus' where id = 800$$,
  '42501', null, 'contacto.perfil_decision_cat_tipo has no UPDATE grant (excluded, tamper-proofing)');

reset role;

-- ---------------------------------------------------------------------------
-- 17-19: soft_delete_contacto -- denies without crm.eliminar, succeeds with it.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$select public.soft_delete_contacto(800)$$,
  '42501', null, 'coordinador (no crm.eliminar) cannot soft-delete contacto');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$select public.soft_delete_contacto(800)$$,
  'administrador (crm.eliminar) can soft-delete contacto');

reset role;

-- Checked with RLS bypassed (superuser): the RLS select policy itself hides
-- deleted_at is not null rows, so this must be verified out-of-band, not
-- through the authenticated role that just performed the soft-delete.
select ok((select deleted_at is not null from public.contacto where id = 800),
  'soft_delete_contacto set deleted_at');

-- ---------------------------------------------------------------------------
-- 20-21: visibility follow (CO6) -- soft-deleting a cliente hides its
-- contacto rows from every read path WITHOUT touching contacto itself.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.contacto where id = 801),
  'contacto 801 visible while its cliente (703) is not deleted');

reset role;

update public.cliente set deleted_at = now() where id = 703;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 0 from public.contacto where id = 801),
  'contacto 801 invisible after its cliente is soft-deleted, even though contacto.deleted_at is still null');

reset role;

select ok((select deleted_at is null from public.contacto where id = 801),
  'contacto 801 itself was never touched by the cliente soft-delete (superuser bypass check)');

-- (cliente 703 stays soft-deleted for the remainder of the file; oportunidad
-- 902's visibility-follow assertion below reuses the same cliente.)

-- ---------------------------------------------------------------------------
-- 22-27: oportunidad RLS as Gerencia / Coordinador / Colaborador (identical
-- shape to contacto, per design).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 1 from public.oportunidad where id = 900),
  'gerencia can SELECT oportunidad tied to a visible cliente');

select throws_ok(
  $$insert into public.oportunidad (cliente_id, nombre) values (701, 'Intrusa')$$,
  '42501', null, 'gerencia cannot INSERT oportunidad (crm.crear required)');

with u as (update public.oportunidad set solucion_propuesta = 'x' where id = 900 returning 1)
select ok((select count(*) = 0 from u),
  'gerencia cannot UPDATE oportunidad (crm.editar required)');

select throws_ok(
  $$delete from public.oportunidad where id = 900$$,
  '42501', null, 'no DELETE grant on oportunidad for authenticated');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$insert into public.oportunidad (cliente_id, nombre) values (701, 'Oportunidad Coord')$$,
  'coordinador can INSERT oportunidad (crm.crear)');

with u as (update public.oportunidad set solucion_propuesta = 'gestionar' where id = 900 returning 1)
select ok((select count(*) = 1 from u),
  'coordinador can UPDATE oportunidad (crm.editar)');

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

with u as (update public.oportunidad set solucion_propuesta = 'x' where id = 900 returning 1)
select ok((select count(*) = 0 from u),
  'colaborador cannot UPDATE oportunidad (crm.editar seeded false)');

reset role;

-- ---------------------------------------------------------------------------
-- 28-31: oportunidad structural/business rules (OP1, OP3).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.oportunidad (cliente_id, nombre) values (701, 'Default Estado')$$,
  'oportunidad.estado defaults to the seeded abierta code (functional default, not a business decision)');

select is(
  (select estado from public.oportunidad where nombre = 'Default Estado'),
  'abierta', 'oportunidad.estado default value is abierta');

select throws_ok(
  $$update public.oportunidad set estado = 'no-existe' where id = 900$$,
  '23503', null, 'oportunidad.estado FK rejects an unlisted code');

select throws_ok(
  $$update public.oportunidad set valor_estimado_cop = -100 where id = 900$$,
  '23514', null, 'oportunidad.valor_estimado_cop rejects a negative value');

-- ---------------------------------------------------------------------------
-- 32-34: soft_delete_oportunidad -- same permission gating as contacto.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$select public.soft_delete_oportunidad(900)$$,
  '42501', null, 'coordinador (no crm.eliminar) cannot soft-delete oportunidad');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$select public.soft_delete_oportunidad(900)$$,
  'administrador (crm.eliminar) can soft-delete oportunidad');

reset role;

select ok((select deleted_at is not null from public.oportunidad where id = 900),
  'soft_delete_oportunidad set deleted_at');

-- ---------------------------------------------------------------------------
-- 35: oportunidad visibility follow (OP5), reusing cliente 703 (already
-- soft-deleted above).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

select ok((select count(*) = 0 from public.oportunidad where id = 902),
  'oportunidad 902 invisible: its cliente (703) is soft-deleted');

reset role;

-- ---------------------------------------------------------------------------
-- 36-39: oportunidad_servicio -- authenticated gets SELECT only, no direct
-- write grant at all (Decision 6). Use a fresh oportunidad (901, cliente 701,
-- still live) so these tests don't collide with the soft-deleted 900 above.
-- ---------------------------------------------------------------------------
insert into public.oportunidad (id, cliente_id, nombre) overriding system value values
  (901, 701, 'Oportunidad Servicios');

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$insert into public.oportunidad_servicio (oportunidad_id, cliente_id, servicio_codigo)
    values (901, 701, 'consultoria')$$,
  '42501', null, 'authenticated cannot directly INSERT into oportunidad_servicio (RPC-only write path)');

select throws_ok(
  $$update public.oportunidad_servicio set servicio_codigo = 'capacitacion' where oportunidad_id = 901$$,
  '42501', null, 'authenticated cannot directly UPDATE oportunidad_servicio');

select throws_ok(
  $$delete from public.oportunidad_servicio where oportunidad_id = 901$$,
  '42501', null, 'authenticated cannot directly DELETE from oportunidad_servicio');

reset role;

-- ---------------------------------------------------------------------------
-- 40-46: set_oportunidad_servicios -- set-replacement semantics (add,
-- replace, clear), permission gating, catalog enforcement.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select throws_ok(
  $$select public.set_oportunidad_servicios(901, array['consultoria']::text[])$$,
  '42501', null, 'colaborador (no crm.editar) cannot call set_oportunidad_servicios');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select lives_ok(
  $$select public.set_oportunidad_servicios(901, array['consultoria','capacitacion']::text[])$$,
  'coordinador (crm.editar) can call set_oportunidad_servicios to add 2 codes');

select ok((select count(*) = 2 from public.oportunidad_servicio where oportunidad_id = 901),
  'set_oportunidad_servicios: first call inserts exactly the 2 given codes');

select lives_ok(
  $$select public.set_oportunidad_servicios(901, array['implementacion']::text[])$$,
  'set_oportunidad_servicios replaces the full set, not an incremental add');

select ok((select count(*) = 1 from public.oportunidad_servicio
           where oportunidad_id = 901 and servicio_codigo = 'implementacion'),
  'set_oportunidad_servicios: second call left only implementacion (old 2 codes removed)');

select ok((select count(*) = 0 from public.oportunidad_servicio
           where oportunidad_id = 901 and servicio_codigo in ('consultoria','capacitacion')),
  'set_oportunidad_servicios: previously-set codes are gone after a full replace, proving delete-then-insert semantics');

select lives_ok(
  $$select public.set_oportunidad_servicios(901, array[]::text[])$$,
  'set_oportunidad_servicios accepts an empty array to clear the full set');

select ok((select count(*) = 0 from public.oportunidad_servicio where oportunidad_id = 901),
  'set_oportunidad_servicios: empty array leaves zero rows (full clear)');

reset role;

-- ---------------------------------------------------------------------------
-- 47-48: set_oportunidad_servicios catalog enforcement + reach.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';

select throws_ok(
  $$select public.set_oportunidad_servicios(901, array['no-existe']::text[])$$,
  '23503', null, 'set_oportunidad_servicios rejects an unlisted servicio_interes code');

select throws_ok(
  $$select public.set_oportunidad_servicios(902, array['consultoria']::text[])$$,
  '42501', null, 'set_oportunidad_servicios denies writes on an oportunidad whose cliente is not visible');

reset role;

-- ---------------------------------------------------------------------------
-- 49: composite FK on the junction -- denormalized cliente_id cannot drift.
-- A mismatched cliente_id (not the oportunidad's real cliente_id) is rejected
-- even at the superuser/grant-bypass level, because it is a genuine FK, not
-- an RLS check.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.oportunidad_servicio (oportunidad_id, cliente_id, servicio_codigo)
    values (901, 702, 'consultoria')$$,
  '23503', null, 'oportunidad_servicio.cliente_id cannot drift from its oportunidad''s real cliente_id (composite FK)');

-- ---------------------------------------------------------------------------
-- 50-54: soft_delete_catalogo's CAT5 guard extended to this PR's 3 new
-- catalog-consuming columns (task 3.9b).
-- ---------------------------------------------------------------------------
-- perfil_decision 'decisor' is in use by contacto 801 (still has
-- perfil_decision unset though) -- use contacto id from the Coordinador
-- insert above instead: set perfil_decision on a live contacto first.
update public.contacto set perfil_decision = 'decisor' where cliente_id = 701 and deleted_at is null
  and nombre = 'Contacto Coord';

-- estado_oportunidad 'ganada' -- put a live oportunidad into that state.
update public.oportunidad set estado = 'ganada' where id = 901;

-- servicio_interes 'implementacion' -- re-populate via the RPC (901 was
-- cleared above), so it is genuinely in use for this guard test.
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444"}';
select public.set_oportunidad_servicios(901, array['implementacion']::text[]);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$select public.soft_delete_catalogo('perfil_decision', 'decisor')$$,
  '23503', null, 'soft_delete_catalogo guard extended: rejects deactivating a perfil_decision code in use by contacto');

select throws_ok(
  $$select public.soft_delete_catalogo('estado_oportunidad', 'ganada')$$,
  '23503', null, 'soft_delete_catalogo guard extended: rejects deactivating an estado_oportunidad code in use by oportunidad');

select throws_ok(
  $$select public.soft_delete_catalogo('servicio_interes', 'implementacion')$$,
  '23503', null, 'soft_delete_catalogo guard extended: rejects deactivating a servicio_interes code in use via oportunidad_servicio');

select lives_ok(
  $$select public.soft_delete_catalogo('servicio_interes', 'capacitacion')$$,
  'soft_delete_catalogo succeeds deactivating a servicio_interes code no longer in use (capacitacion was removed by the set-replace above)');

select ok((select not activo from public.catalogo where tipo = 'servicio_interes' and codigo = 'capacitacion'),
  'soft_delete_catalogo actually flipped activo to false for the unused code');

reset role;

-- ---------------------------------------------------------------------------
-- 55-58: views + structural guarantees.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_contacto' and relnamespace = 'public'::regnamespace),
  'v_contacto is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_oportunidad' and relnamespace = 'public'::regnamespace),
  'v_oportunidad is a security_invoker view');

select ok((select count(*) = 1 from pg_constraint
           where conname = 'oportunidad_id_cliente_uk' and conrelid = 'public.oportunidad'::regclass),
  'oportunidad_id_cliente_uk unique(id,cliente_id) constraint exists (backs the junction composite FK)');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'oportunidad_servicio'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'oportunidad_servicio has no INSERT/UPDATE/DELETE grant for authenticated at all');

select * from finish();

rollback;
