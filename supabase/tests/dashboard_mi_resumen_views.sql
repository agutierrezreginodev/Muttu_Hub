-- pgTAP: dashboard_mi_resumen_views migration (dashboard-4-caras PR-5, task
-- 5.1/5.2, design.md §4.4, spec dashboard-mi-resumen). Task 5.7 gate: the
-- Kanban `tarea` contract was re-confirmed unchanged (see apply-progress) --
-- no `completed_at`, no schema drift -- so this suite exercises the FULL
-- scope of the design, including `origen = 'Kanban'` rows in the self-scoped
-- rollup, not just the CRM/Ambos independent slice.
--
-- Asserts:
--   1. security_invoker flag on both views.
--   2. authenticated: SELECT-only grant (no INSERT/UPDATE/DELETE) on both.
--   3. self-scoping: user A's rollup NEVER includes user B's tareas/clientes,
--      proven both by per-row value correctness (counts match ONLY A's
--      fixtures) and by the total row/scalar count for each caller.
--   4. `vencido`/`vencen_pronto` filter correctness on fixtures spanning all
--      three `origen` values and both terminal/non-terminal estados.
--   5. `v_dashboard_mis_clientes` value correctness (self-scoped by
--      `responsable_interno_id`).

begin;

select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, bypasses RLS/grants entirely -- same convention as
-- dashboard_tareas_views.sql / crm_contacto_oportunidad_rls.sql).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('96000001-9600-9600-9600-960000000001', 'mi-resumen-a@test.local'),
  ('96000002-9600-9600-9600-960000000002', 'mi-resumen-b@test.local');

insert into public.usuario (id, nombre, email, rol_id) values
  ('96000001-9600-9600-9600-960000000001', 'Mi Resumen A', 'mi-resumen-a@test.local',
   (select id from public.rol where nombre = 'Coordinador')),
  ('96000002-9600-9600-9600-960000000002', 'Mi Resumen B', 'mi-resumen-b@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

-- Both users keep the Coordinador role's default crm.ver=true/kanban.ver=true
-- unchanged (no permisos_override) -- this suite isolates the SELF-SCOPING
-- boundary (`responsable_id`/`responsable_interno_id` = auth.uid()), not the
-- origen-aware permission boundary (already proven by
-- dashboard_tareas_views.sql).

-- Clientes: A owns 2, B owns 1 -- distinguishes count, not just presence.
insert into public.cliente (nombre, responsable_interno_id) values
  ('Cliente 1 de A', '96000001-9600-9600-9600-960000000001'),
  ('Cliente 2 de A', '96000001-9600-9600-9600-960000000001'),
  ('Cliente de B', '96000002-9600-9600-9600-960000000002');

-- Tareas for A -- span all 3 origen values + terminal/non-terminal, created
-- under A's own jwt context so the audit trigger populates created_by.
set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

-- A1: CRM, pendiente, due in 3 days -> non-terminal, within the 7-day
-- horizon -> vencido=false, vencen_pronto=true.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('A1 CRM pendiente vencen-pronto', '96000001-9600-9600-9600-960000000001',
          now() + interval '3 days', 'pendiente', 'CRM');

-- A2: Kanban, en_curso, past due -> non-terminal -> vencido=true,
-- vencen_pronto=false (already overdue, not "coming soon").
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('A2 Kanban en_curso vencida', '96000001-9600-9600-9600-960000000001',
          now() - interval '1 day', 'en_curso', 'Kanban');

-- A3: Ambos, pendiente, no fecha_limite -> neither vencido nor vencen_pronto.
insert into public.tarea (titulo, responsable_id, estado, origen)
  values ('A3 Ambos pendiente sin-fecha', '96000001-9600-9600-9600-960000000001',
          'pendiente', 'Ambos');

-- A4: CRM, cumplido (terminal), past due -> vencido MUST be false (terminal),
-- vencen_pronto MUST be false (terminal is excluded from the horizon filter).
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('A4 CRM cumplido vencida-pero-terminal', '96000001-9600-9600-9600-960000000001',
          now() - interval '10 days', 'cumplido', 'CRM');

-- A5: Kanban, cancelado (terminal), due in 2 days -> vencido=false,
-- vencen_pronto MUST be false despite being within the horizon (terminal).
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('A5 Kanban cancelado dentro-de-horizonte-pero-terminal',
          '96000001-9600-9600-9600-960000000001',
          now() + interval '2 days', 'cancelado', 'Kanban');

-- Tareas for B -- same estado/origen as A1, DIFFERENT count, to prove A's
-- query never leaks B's row into the same (estado, origen) bucket.
set local request.jwt.claims to '{"sub":"96000002-9600-9600-9600-960000000002"}';

-- B1: CRM, pendiente, due in 1 day -> vencido=false, vencen_pronto=true.
insert into public.tarea (titulo, responsable_id, fecha_limite, estado, origen)
  values ('B1 CRM pendiente vencen-pronto', '96000002-9600-9600-9600-960000000002',
          now() + interval '1 day', 'pendiente', 'CRM');

reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 1-2: security_invoker flag on both views.
-- ---------------------------------------------------------------------------
select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_mi_resumen_tareas' and relnamespace = 'public'::regnamespace),
  'v_dashboard_mi_resumen_tareas is a security_invoker view');

select ok((select reloptions::text like '%security_invoker=true%'
           from pg_class where relname = 'v_dashboard_mis_clientes' and relnamespace = 'public'::regnamespace),
  'v_dashboard_mis_clientes is a security_invoker view');

-- ---------------------------------------------------------------------------
-- 3-6: authenticated SELECT-only grants (no INSERT/UPDATE/DELETE) on both.
-- ---------------------------------------------------------------------------
select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_mi_resumen_tareas'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_mi_resumen_tareas has no INSERT/UPDATE/DELETE grant for authenticated');
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_mi_resumen_tareas'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_mi_resumen_tareas');

select ok((select count(*) = 0 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_mis_clientes'
             and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),
  'v_dashboard_mis_clientes has no INSERT/UPDATE/DELETE grant for authenticated');
select ok((select count(*) = 1 from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'v_dashboard_mis_clientes'
             and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'authenticated has SELECT on v_dashboard_mis_clientes');

-- ---------------------------------------------------------------------------
-- 7-12: v_dashboard_mi_resumen_tareas -- as A: exactly 5 rows (A1..A5), each
-- with the expected estado/origen/tareas/vencidas/vencen_pronto, and NEVER
-- B's (pendiente, CRM) row folded in.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

select ok((select count(*) = 5 from public.v_dashboard_mi_resumen_tareas),
  'A: exactly 5 estado/origen rows (A1..A5), never B''s row folded in');

select ok((select tareas = 1 and vencidas = 0 and vencen_pronto = 1
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'pendiente' and origen = 'CRM'),
  'A: (pendiente, CRM) = 1 tarea (A1 only, not B''s), 0 vencidas, 1 vencen_pronto');

select ok((select tareas = 1 and vencidas = 1 and vencen_pronto = 0
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'en_curso' and origen = 'Kanban'),
  'A: (en_curso, Kanban) = 1 tarea (A2), 1 vencida, 0 vencen_pronto (already overdue)');

select ok((select tareas = 1 and vencidas = 0 and vencen_pronto = 0
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'pendiente' and origen = 'Ambos'),
  'A: (pendiente, Ambos) = 1 tarea (A3, no fecha_limite), 0 vencidas, 0 vencen_pronto');

select ok((select tareas = 1 and vencidas = 0 and vencen_pronto = 0
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'cumplido' and origen = 'CRM'),
  'A: (cumplido, CRM) = 1 tarea (A4), 0 vencidas (terminal, despite past due), 0 vencen_pronto');

select ok((select tareas = 1 and vencidas = 0 and vencen_pronto = 0
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'cancelado' and origen = 'Kanban'),
  'A: (cancelado, Kanban) = 1 tarea (A5), 0 vencidas, 0 vencen_pronto (terminal excludes the horizon filter)');

-- ---------------------------------------------------------------------------
-- 13-14: as B -- exactly 1 row, never A's rows.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"96000002-9600-9600-9600-960000000002"}';

select ok((select count(*) = 1 from public.v_dashboard_mi_resumen_tareas),
  'B: exactly 1 estado/origen row (B1 only), never A''s 5 rows');

select ok((select tareas = 1 and vencidas = 0 and vencen_pronto = 1
           from public.v_dashboard_mi_resumen_tareas
           where estado = 'pendiente' and origen = 'CRM'),
  'B: (pendiente, CRM) = 1 tarea (B1 only, not A''s), 0 vencidas, 1 vencen_pronto');

-- ---------------------------------------------------------------------------
-- 15-16: v_dashboard_mis_clientes -- A owns 2, B owns 1, self-scoped.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

select ok((select mis_clientes = 2 from public.v_dashboard_mis_clientes),
  'A: mis_clientes = 2 (Cliente 1 de A + Cliente 2 de A), never B''s cliente');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"96000002-9600-9600-9600-960000000002"}';

select ok((select mis_clientes = 1 from public.v_dashboard_mis_clientes),
  'B: mis_clientes = 1 (Cliente de B only), never A''s 2 clientes');

reset role;

-- ---------------------------------------------------------------------------
-- 17-18: a user with NOTHING assigned (no tareas, no clientes) gets zero rows
-- / zero count everywhere -- spec dashboard-mi-resumen: "no error".
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('96000003-9600-9600-9600-960000000003', 'mi-resumen-nada@test.local');
insert into public.usuario (id, nombre, email, rol_id) values
  ('96000003-9600-9600-9600-960000000003', 'Mi Resumen Nada', 'mi-resumen-nada@test.local',
   (select id from public.rol where nombre = 'Coordinador'));

set local role authenticated;
set local request.jwt.claims to '{"sub":"96000003-9600-9600-9600-960000000003"}';

select ok((select count(*) = 0 from public.v_dashboard_mi_resumen_tareas),
  'user with nothing assigned: v_dashboard_mi_resumen_tareas returns zero rows');
select ok((select mis_clientes = 0 from public.v_dashboard_mis_clientes),
  'user with nothing assigned: v_dashboard_mis_clientes returns mis_clientes = 0');

reset role;

-- ---------------------------------------------------------------------------
-- 19-20: a viewer lacking BOTH crm.ver and kanban.ver gets zero rows from
-- BOTH views -- tareas via tarea_select RLS underneath the self-scope filter
-- (design.md §1 Decision 1), and clientes via cliente_select RLS (which also
-- requires crm.ver, supabase/migrations/20260728041925_audit.sql) even
-- though the clientes are still self-owned.
-- ---------------------------------------------------------------------------
update public.usuario set permisos_override = '{"crm":{"ver": false},"kanban":{"ver": false}}'
  where id = '96000001-9600-9600-9600-960000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"96000001-9600-9600-9600-960000000001"}';

select ok((select count(*) = 0 from public.v_dashboard_mi_resumen_tareas),
  'A without crm.ver/kanban.ver: v_dashboard_mi_resumen_tareas returns zero rows despite owning A1..A5');
select ok((select mis_clientes = 0 from public.v_dashboard_mis_clientes),
  'A without crm.ver/kanban.ver: v_dashboard_mis_clientes is also zero (cliente_select RLS needs crm.ver too)');

reset role;

select * from finish();

rollback;
