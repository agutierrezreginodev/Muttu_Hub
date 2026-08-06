-- pgTAP for 20260806192006_digest_service_role_grants.sql.
--
-- These assertions exist because the absence of these grants did NOT announce
-- itself: the digest returned 200 with a zero count while both reads were
-- being refused. A silent-failure mode deserves a loud test.

begin;
select plan(10);

-- -----------------------------------------------------------------------------
-- The two grants this migration adds
-- -----------------------------------------------------------------------------
select ok(
  has_table_privilege('service_role', 'public.v_usuario_activo', 'SELECT'),
  'service_role can SELECT v_usuario_activo (the digest recipient list)'
);
select ok(
  has_table_privilege('service_role', 'public.v_tarea', 'SELECT'),
  'service_role can SELECT v_tarea (the digest rows)'
);

-- Behavioural, not just catalog: actually read as the role. BYPASSRLS and the
-- table privilege are two different gates and only the second one was missing,
-- so a catalog-only assertion could pass against a broken grant chain.
set local role service_role;
select lives_ok(
  'select count(*) from public.v_usuario_activo',
  'service_role really can read v_usuario_activo, not merely be granted it'
);
select lives_ok(
  'select count(*) from public.v_tarea',
  'service_role really can read v_tarea'
);
reset role;

-- -----------------------------------------------------------------------------
-- What slice 3 already provided, re-asserted so the digest's full read set is
-- covered in one place rather than split across two files.
-- -----------------------------------------------------------------------------
select ok(
  has_table_privilege('service_role', 'public.notificacion_preferencia', 'SELECT'),
  'service_role can read the opt-out flags'
);
select ok(
  has_table_privilege('service_role', 'public.digest_envio', 'SELECT'),
  'service_role can read digest_envio'
);
select ok(
  has_table_privilege('service_role', 'public.digest_envio', 'INSERT'),
  'service_role can claim a digest_envio row'
);

-- -----------------------------------------------------------------------------
-- What must stay ungranted. The digest reads tareas and users; it writes only
-- digest_envio.
-- -----------------------------------------------------------------------------
select ok(
  not has_table_privilege('service_role', 'public.v_tarea', 'UPDATE'),
  'service_role cannot write through v_tarea'
);
select ok(
  not has_table_privilege('service_role', 'public.digest_envio', 'UPDATE'),
  'digest_envio stays append-only even for its own writer'
);
select ok(
  not has_table_privilege('service_role', 'public.digest_envio', 'DELETE'),
  'digest_envio rows cannot be deleted by the digest'
);

select * from finish();
rollback;
