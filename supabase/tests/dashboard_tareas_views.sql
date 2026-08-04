-- pgTAP: dashboard_tareas_views migration (dashboard-4-caras PR-4, task
-- 4.1/4.2, design.md §4.2, spec dashboard-tareas). Asserts:
--   1. security_invoker flag on all 3 views.
--   2. authenticated: SELECT-only grant (no INSERT/UPDATE/DELETE) on all 3.
--   3. origen-aware scoping: a crm.ver-only caller's counts include
--      `origen in ('CRM','Ambos')` and exclude `origen = 'Kanban'`; a
--      kanban.ver-only caller's counts include `origen in ('Kanban','Ambos')`
--      and exclude `origen = 'CRM'`; an `Ambos` row counts for BOTH.
--   4. `vencido` filter correctness: a non-terminal tarea past `fecha_limite`
--      is vencido; a TERMINAL tarea (cumplido/cancelado) past `fecha_limite`
--      is NOT vencido (v_tarea's own derived-column semantics, forwarded
--      unchanged).
--   5. throughput weekly bucket + correct values on fixtures.
--   6. por-responsable correct values on fixtures.
--
-- Judgment call disclosed: `tarea_audit_fields` (audit trigger,
-- supabase/migrations/20260728041925_audit.sql) stamps `updated_at` from
-- `clock_timestamp()` on every INSERT/UPDATE -- it is NOT settable to an
-- arbitrary past value (by design, same reasoning documented in that
-- migration and exercised by notificacion_preferencia_digest_rls.sql). This
-- test therefore does NOT attempt to fabricate multiple past week buckets;
-- it inserts several `cumplido` fixtures within this single transaction (all
-- real, near-identical `clock_timestamp()` values) and asserts they fall
-- into exactly ONE bucket -- `date_trunc('week', now())::date` -- with the
-- correct per-caller count. This proves the view's `date_trunc`/`group by`
-- grouping and origen-aware filtering for real, without fighting the
-- trigger. (Negligible flake risk: only if the transaction happens to
-- straddle a Monday-00:00-UTC week boundary.)

begin;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely -- same convention as
-- crm_contacto_oportunidad_rls.sql / dashboard_actividad_views.sql).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('95000001-9500-9500-9500-950000000001', 'crm-only-tareas@test.local'),
  ('95000002-9500-9500-9500-950000000002', 'kanban-only-tareas@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('95000001-9500-9500-9500-950000000001', 'Crm Only Tareas', 'crm-only-tareas@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('95000002-9500-9500-9500-950000000002', 'Kanban Only Tareas', 'kanban-only-tareas@test.local',
   (select id from public.rol where nombre = 'Colaborador'));

-- Coordinador/Colaborador both hold crm.ver=true AND kanban.ver=true by
-- default seed; override each user's effective permission so ONE caller is
-- crm.ver-only and the OTHER is kanban.ver-only (override beats the role,
-- same "sinver" fixture pattern as every other pgTAP file in this repo).
update public.usuario set permisos_override = '{"kanban":{"ver": false}}'
  where id = '95000001-9500-9500-9500-950000000001';
update public.usuario set permisos_override = '{"crm":{"ver": false}}'
  where id = '95000002-9500-9500-9500-950000000002';

-- Tarea fixtures, created under each actor's own auth context (still
-- superuser role -- RLS is bypassed regardless -- but `request.jwt.claims`
-- makes `auth.uid()` resolve so the audit trigger populates created_by for
-- real, same technique crm_contacto_oportunidad_rls.sql uses for its own
-- superuser-bypass fixtures).
set local request.jwt.claims to '{"sub":"95000001-9500-9500-9500-950000000001"}';

-- T1: CRM, pendiente, past fecha_limite, non-terminal -> vencido = true.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('T1 CRM pendiente vencida', '95000001-9500-9500-9500-950000000001',
          now() - interval '1 day', 'pendiente', 'CRM');

-- T2: CRM, cumplido (throughput bucket, CRM-visible).
insert into public.tarea (titulo, responsable_id, estado, origen)
  values ('T2 CRM cumplido', '95000001-9500-9500-9500-950000000001', 'cumplido', 'CRM');

-- T7: CRM, borrador (responsable_id MUST be null in borrador, D4 constraint).
insert into public.tarea (titulo, estado, origen)
  values ('T7 CRM borrador', 'borrador', 'CRM');

-- T9: CRM, cancelado, past fecha_limite, TERMINAL -> vencido MUST be false
-- despite the past due date (proves the terminal-state half of `vencido`).
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('T9 CRM cancelado vencida-pero-terminal', '95000002-9500-9500-9500-950000000002',
          now() - interval '4 days', 'cancelado', 'CRM');

set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

-- T3: Kanban, en_curso, future fecha_limite -> vencido = false.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('T3 Kanban en_curso', '95000002-9500-9500-9500-950000000002',
          now() + interval '5 days', 'en_curso', 'Kanban');

-- T4: Kanban, cumplido (throughput bucket, Kanban-visible).
insert into public.tarea (titulo, responsable_id, estado, origen)
  values ('T4 Kanban cumplido', '95000002-9500-9500-9500-950000000002', 'cumplido', 'Kanban');

-- T5: Ambos, pendiente, past fecha_limite, non-terminal -> vencido = true.
-- Visible to BOTH callers.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('T5 Ambos pendiente vencida', '95000001-9500-9500-9500-950000000001',
          now() - interval '2 days', 'pendiente', 'Ambos');

-- T6: Ambos, cancelado, past fecha_limite, TERMINAL -> vencido = false.
-- Visible to BOTH callers.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('T6 Ambos cancelado', '95000002-9500-9500-9500-950000000002',
          now() - interval '3 days', 'cancelado', 'Ambos');

-- T8: Ambos, cumplido (throughput bucket, visible to BOTH callers).
insert into public.tarea (titulo, responsable_id, estado, origen)
  values ('T8 Ambos cumplido', '95000001-9500-9500-9500-950000000001', 'cumplido', 'Ambos');

reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 1-3: security_invoker flag on all 3 views.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_tareas_estado' and relnamespace = 'public'::regnamespace),
  'v_dashboard_tareas_estado is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_tareas_responsable' and relnamespace = 'public'::regnamespace),
  'v_dashboard_tareas_responsable is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_tareas_throughput' and relnamespace = 'public'::regnamespace),
  'v_dashboard_tareas_throughput is a security_invoker view');

-- ---------------------------------------------------------------------------
-- 4-9: authenticated SELECT-only grants (no INSERT/UPDATE/DELETE) on all 3.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_estado'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_tareas_estado has no INSERT/UPDATE/DELETE grant for authenticated');
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_estado'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_tareas_estado');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_responsable'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_tareas_responsable has no INSERT/UPDATE/DELETE grant for authenticated');
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_responsable'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_tareas_responsable');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_throughput'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_tareas_throughput has no INSERT/UPDATE/DELETE grant for authenticated');
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_tareas_throughput'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_tareas_throughput');

-- ---------------------------------------------------------------------------
-- 10-13: origen-aware scoping via v_tarea directly -- an Ambos row is
-- visible to BOTH callers; a CRM-only row is excluded from the kanban-only
-- caller and vice versa.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000001-9500-9500-9500-950000000001"}';

select ok((select count(*) = 3 from public.v_tarea where origen = 'Ambos'
           and titulo in ('T5 Ambos pendiente vencida','T6 Ambos cancelado','T8 Ambos cumplido')),
  'crm.ver-only caller: all 3 Ambos-origin tareas are visible');
select ok((select count(*) = 0 from public.v_tarea where origen = 'Kanban'),
  'crm.ver-only caller: zero Kanban-origin tareas visible');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

select ok((select count(*) = 3 from public.v_tarea where origen = 'Ambos'
           and titulo in ('T5 Ambos pendiente vencida','T6 Ambos cancelado','T8 Ambos cumplido')),
  'kanban.ver-only caller: all 3 Ambos-origin tareas are visible');
select ok((select count(*) = 0 from public.v_tarea where origen = 'CRM'),
  'kanban.ver-only caller: zero CRM-origin tareas visible');

reset role;

-- ---------------------------------------------------------------------------
-- 14-17: v_dashboard_tareas_estado -- correct per-estado counts + vencidas,
-- crm.ver-only caller (CRM + Ambos = 7 rows: T1,T2,T5,T6,T7,T8,T9).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000001-9500-9500-9500-950000000001"}';

select ok((select tareas = 2 and vencidas = 2 from public.v_dashboard_tareas_estado
           where estado = 'pendiente'),
  'crm.ver-only: pendiente = 2 tareas, 2 vencidas (T1 + T5, both non-terminal + past due)');

select ok((select tareas = 2 and vencidas = 0 from public.v_dashboard_tareas_estado
           where estado = 'cumplido'),
  'crm.ver-only: cumplido = 2 tareas (T2 CRM + T8 Ambos), 0 vencidas');

select ok((select tareas = 2 and vencidas = 0 from public.v_dashboard_tareas_estado
           where estado = 'cancelado'),
  'crm.ver-only: cancelado = 2 tareas (T6 Ambos + T9 CRM), 0 vencidas (terminal, despite past due)');

select ok((select count(*) = 0 from public.v_dashboard_tareas_estado where estado = 'en_curso'),
  'crm.ver-only: no en_curso row at all (T3 is Kanban-only, excluded)');

-- ---------------------------------------------------------------------------
-- 18-20: v_dashboard_tareas_estado -- kanban.ver-only caller (Kanban + Ambos
-- = 5 rows: T3,T4,T5,T6,T8).
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

select ok((select tareas = 1 and vencidas = 0 from public.v_dashboard_tareas_estado
           where estado = 'en_curso'),
  'kanban.ver-only: en_curso = 1 tarea (T3), 0 vencidas (future fecha_limite)');

select ok((select tareas = 1 and vencidas = 1 from public.v_dashboard_tareas_estado
           where estado = 'pendiente'),
  'kanban.ver-only: pendiente = 1 tarea (T5 Ambos only, T1 CRM excluded), 1 vencida');

select ok((select count(*) = 0 from public.v_dashboard_tareas_estado where estado = 'borrador'),
  'kanban.ver-only: no borrador row at all (T7 is CRM-only, excluded)');

-- ---------------------------------------------------------------------------
-- 21-22: v_dashboard_tareas_responsable -- correct abiertas/vencidas per
-- responsable, per caller (design.md §4.2: "open" = pendiente/en_curso).
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000001-9500-9500-9500-950000000001"}';

select ok((select abiertas = 2 and vencidas = 2 from public.v_dashboard_tareas_responsable
           where responsable_id = '95000001-9500-9500-9500-950000000001'),
  'crm.ver-only: responsable A has 2 abiertas + 2 vencidas (T1 + T5, both pendiente + vencido)');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

select ok((select abiertas = 1 and vencidas = 0 from public.v_dashboard_tareas_responsable
           where responsable_id = '95000002-9500-9500-9500-950000000002'),
  'kanban.ver-only: responsable B has 1 abierta (T3 en_curso), 0 vencidas');

-- ---------------------------------------------------------------------------
-- 23-24: v_dashboard_tareas_throughput -- weekly bucket + correct
-- per-caller cumplidas count (see judgment call disclosed at the top).
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000001-9500-9500-9500-950000000001"}';

select ok((select count(*) = 1 from public.v_dashboard_tareas_throughput
           where semana = date_trunc('week', now())::date),
  'crm.ver-only: exactly one throughput bucket, this week');
select ok((select cumplidas = 2 from public.v_dashboard_tareas_throughput
           where semana = date_trunc('week', now())::date),
  'crm.ver-only: this week''s bucket has 2 cumplidas (T2 CRM + T8 Ambos)');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

select ok((select cumplidas = 2 from public.v_dashboard_tareas_throughput
           where semana = date_trunc('week', now())::date),
  'kanban.ver-only: this week''s bucket has 2 cumplidas (T4 Kanban + T8 Ambos)');

reset role;

-- ---------------------------------------------------------------------------
-- 25-26: a viewer lacking BOTH crm.ver and kanban.ver sees zero rows across
-- every view (spec dashboard-tareas: "no visible tareas -> zero everywhere").
-- ---------------------------------------------------------------------------
update public.usuario set permisos_override = '{"crm":{"ver": false},"kanban":{"ver": false}}'
  where id = '95000002-9500-9500-9500-950000000002';

set local role authenticated;
set local request.jwt.claims to '{"sub":"95000002-9500-9500-9500-950000000002"}';

select ok((select count(*) = 0 from public.v_dashboard_tareas_estado),
  'viewer without crm.ver or kanban.ver: v_dashboard_tareas_estado returns zero rows');
select ok((select count(*) = 0 from public.v_dashboard_tareas_throughput),
  'viewer without crm.ver or kanban.ver: v_dashboard_tareas_throughput returns zero rows');

reset role;

select * from finish();

rollback;
