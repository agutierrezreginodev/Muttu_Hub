-- pgTAP: crm_catalogos migration — generic catalogo(tipo, codigo) table, its
-- RLS/grant matrix, and the CHECK->FK promotion of cliente.tipo_cliente,
-- cliente.estado, tarea.prioridad onto it via the pinned-discriminator
-- mechanism (sdd/crm-module/design, Engram obs #152, Decision 1). Covers
-- PR1 task 1.2.
--
-- Note on Decision 1's Open Question: only `estado_cliente` and `prioridad`
-- codes are seeded in this migration (business-confirmed shape, same as
-- design's own DDL). `tipo_cliente` codes are NOT seeded here — no business
-- values exist yet (design's own Open Question defers them alongside the 6
-- other new catalogs) — so every non-null tipo_cliente write is currently
-- rejected by the FK; NULL still passes (MATCH SIMPLE). This is asserted
-- below rather than assumed.

begin;

select plan(30);

-- Fixtures (superuser). Reuses the same role/user shape as domain_rules.sql
-- and audit_security.sql — admin has admin.crear/admin.editar; coordinador
-- and colaborador do not (seed.sql matrix).
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

insert into public.cliente (id, nombre, estado) overriding system value values
  (301, 'Cliente Catalogo Uno', 'activo');

insert into public.tarea (id, titulo, origen, estado, responsable_id, cliente_id, prioridad)
overriding system value values
  (401, 'Tarea Catalogo Uno', 'CRM', 'pendiente',
   '44444444-4444-4444-4444-444444444444', 301, 'Alta');

-- 1-6: catalogo RLS/grant matrix.
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555"}';

select ok((select count(*) > 0 from public.catalogo where tipo = 'estado_cliente'),
  'any authenticated user (even colaborador, no admin perms) can SELECT catalogo');

select throws_ok(
  $$insert into public.catalogo (tipo, codigo, etiqueta) values ('estado_cliente', 'suspendido', 'Suspendido')$$,
  '42501', null, 'colaborador cannot INSERT catalogo (admin.crear required)');

with u as (update public.catalogo set etiqueta = 'x'
           where tipo = 'estado_cliente' and codigo = 'activo' returning 1)
select ok((select count(*) = 0 from u),
  'colaborador cannot UPDATE catalogo (admin.editar required; RLS silently filters the row)');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

select lives_ok(
  $$insert into public.catalogo (tipo, codigo, etiqueta, orden) values ('estado_cliente', 'suspendido', 'Suspendido', 4)$$,
  'administrador (admin.crear) can INSERT catalogo');

select lives_ok(
  $$update public.catalogo set etiqueta = 'Suspendido (rev)' where tipo = 'estado_cliente' and codigo = 'suspendido'$$,
  'administrador (admin.editar) can UPDATE catalogo');

select throws_ok(
  $$delete from public.catalogo where tipo = 'estado_cliente' and codigo = 'suspendido'$$,
  '42501', null, 'no DELETE grant exists on catalogo, not even for administrador');

-- 7-8: column-restricted UPDATE grant — tipo/codigo are immutable.
select throws_ok(
  $$update public.catalogo set codigo = 'renombrado' where tipo = 'estado_cliente' and codigo = 'suspendido'$$,
  '42501', null, 'codigo is excluded from the UPDATE grant (immutable natural key)');

select throws_ok(
  $$update public.catalogo set tipo = 'otro' where tipo = 'estado_cliente' and codigo = 'suspendido'$$,
  '42501', null, 'tipo is excluded from the UPDATE grant (immutable natural key)');

reset role;

-- 9-11: discriminator CHECK rejects a forged tipo literal (grant-layer
-- exclusion means only a superuser/table owner can reach the CHECK itself).
select throws_ok(
  $$update public.cliente set tipo_cliente_cat_tipo = 'bogus' where id = 301$$,
  '23514', null, 'cliente.tipo_cliente_cat_tipo CHECK rejects a forged literal');

select throws_ok(
  $$update public.cliente set estado_cat_tipo = 'bogus' where id = 301$$,
  '23514', null, 'cliente.estado_cat_tipo CHECK rejects a forged literal');

select throws_ok(
  $$update public.tarea set prioridad_cat_tipo = 'bogus' where id = 401$$,
  '23514', null, 'tarea.prioridad_cat_tipo CHECK rejects a forged literal');

-- 12-13: on delete restrict — triangulated: an unused code can be deleted
-- (superuser, since no grant exists for anyone), an in-use one cannot.
select lives_ok(
  $$delete from public.catalogo where tipo = 'estado_cliente' and codigo = 'suspendido'$$,
  'an unused catalogo code can be deleted (superuser, proves the restrict is FK-driven, not a blanket lock)');

select throws_ok(
  $$delete from public.catalogo where tipo = 'estado_cliente' and codigo = 'activo'$$,
  '23503', null, 'a catalogo code referenced by an existing cliente row cannot be deleted (on delete restrict)');

select throws_ok(
  $$delete from public.catalogo where tipo = 'prioridad' and codigo = 'Alta'$$,
  '23503', null, 'a catalogo code referenced by an existing tarea row cannot be deleted (on delete restrict)');

-- 14-16: value preservation — existing natural-text codes round-trip
-- byte-for-byte through the new FK, zero rewrite.
select is((select estado from public.cliente where id = 301), 'activo',
  'cliente.estado keeps its exact pre-promotion value (no data rewrite)');

select is((select prioridad from public.tarea where id = 401), 'Alta',
  'tarea.prioridad keeps its exact pre-promotion value (no data rewrite)');

select is((select tipo_cliente from public.cliente where id = 301), null,
  'cliente.tipo_cliente (never set) stays null through the promotion');

-- 17-23: catalog FK rejects an unlisted code on all 3 promoted columns;
-- known-seeded codes and NULL (MATCH SIMPLE) still pass.
select throws_ok(
  $$update public.cliente set estado = 'zombie' where id = 301$$,
  '23503', null, 'cliente.estado FK rejects an unlisted code');

select lives_ok(
  $$update public.cliente set estado = 'inactivo' where id = 301$$,
  'cliente.estado FK accepts a seeded code');

select throws_ok(
  $$update public.tarea set prioridad = 'Urgente' where id = 401$$,
  '23503', null, 'tarea.prioridad FK rejects an unlisted code');

select lives_ok(
  $$update public.tarea set prioridad = 'Media' where id = 401$$,
  'tarea.prioridad FK accepts a seeded code');

select lives_ok(
  $$update public.tarea set prioridad = null where id = 401$$,
  'tarea.prioridad FK accepts NULL (MATCH SIMPLE)');

select throws_ok(
  $$update public.cliente set tipo_cliente = 'Cualquiera' where id = 301$$,
  '23503', null, 'cliente.tipo_cliente FK rejects any code (no tipo_cliente codes seeded yet, Open Question 1)');

select lives_ok(
  $$update public.cliente set tipo_cliente = null where id = 301$$,
  'cliente.tipo_cliente FK accepts NULL (MATCH SIMPLE) even with zero seeded codes');

-- 24: tarea.estado / tarea.origen must NOT be touched by this migration —
-- they stay CHECK-constrained exactly as platform-foundation shipped them.
select ok((select count(*) = 1 from pg_constraint
           where conname = 'tarea_estado_check' and conrelid = 'public.tarea'::regclass),
  'tarea_estado_check is untouched (CAT7 — RLS/vencido discriminator stays CHECK)');

select ok((select count(*) = 1 from pg_constraint
           where conname = 'tarea_origen_check' and conrelid = 'public.tarea'::regclass),
  'tarea_origen_check is untouched (CAT7 — RLS discriminator stays CHECK)');

-- 26-29: structural guarantees.
select col_is_pk('public', 'catalogo', array['tipo', 'codigo'], 'catalogo PK is (tipo, codigo)');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_catalogo' and relnamespace = 'public'::regnamespace),
  'v_catalogo is a security_invoker view');

select has_index('public', 'catalogo', 'catalogo_tipo_orden_idx',
  'partial index on catalogo(tipo, orden) where activo exists');

select ok((select count(*) = 0 from information_schema.columns
           where table_schema = 'public' and table_name = 'catalogo' and column_name = 'deleted_at'),
  'catalogo has no deleted_at (Decision 7 — activo boolean is the only lifecycle flag)');

select * from finish();

rollback;
