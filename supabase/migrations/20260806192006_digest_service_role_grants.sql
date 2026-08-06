-- Kanban slice 11a/11b: let the digest actually read what it needs.
--
-- FOUND BY PROBING THE RUNNING FUNCTION, not by reading the schema. Invoking
-- the deployed daily-digest returned a cheerful `200 {"enviados":0}` while
-- BOTH of its reads were failing with "permission denied". The handler
-- destructured `{ data }` and ignored `error`, so a completely broken digest
-- reported itself healthy — every day, forever, with nothing in the logs to
-- say otherwise. The handler now checks those errors (see index.ts); this
-- migration removes the cause.
--
-- The cause is the lesson `20260728050000_service_role_grants.sql:1-16`
-- already recorded and this slice re-learned the hard way: `service_role` has
-- rolbypassrls, but **BYPASSRLS does not skip table-privilege checks**. Row
-- visibility and table privilege are two separate gates, and the digest was
-- passing the first while failing the second.
--
-- Measured before writing this file:
--   v_usuario_activo -> service_role SELECT = false  (permission denied)
--   v_tarea          -> service_role SELECT = false  (permission denied)
--   notificacion_preferencia, digest_envio -> already granted by slice 3
--
-- Additive statements in a NEW migration (correction C2). The earlier grant
-- migrations are not edited.

-- The recipient list. Read once per run, before the per-recipient loop.
grant select on public.v_usuario_activo to service_role;

-- The tareas themselves. `v_tarea` is `security_invoker`, so under
-- service_role's BYPASSRLS it exposes every row — which is precisely why
-- `fetchDueTareas` narrows by `responsable_id` IN THE QUERY and never scans
-- the table to bucket in application code (design D6(e)). The grant widens
-- privilege, not scope; the scoping stays the function's job.
grant select on public.v_tarea to service_role;

-- Deliberately NOT granted: insert, update or delete on either object. The
-- digest reads tareas and users; the only thing it ever writes is
-- `digest_envio`, which slice 3 already granted and which has no UPDATE or
-- DELETE grant for anyone at all.
