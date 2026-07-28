-- Fixes a grants gap left by 0003_audit: migration 20260728041925_audit.sql
-- revoked the (Supabase default-privilege) ALL grant from anon/authenticated
-- and re-granted only the design's authenticated matrix, but never granted
-- anything to service_role on the same 5 tables. service_role has
-- rolbypassrls = true (it skips RLS policies), but BYPASSRLS does NOT skip
-- ordinary table-privilege checks — GRANTs are still required. Without this
-- fix, every service-role code path fails with "permission denied":
--   * scripts/bootstrap-admin.ts (SELECT rol, INSERT usuario, INSERT
--     registro_acceso) — discovered while verifying PR3 auth flows locally.
--   * design's own RLS/grants table (Engram sdd/platform-foundation/design,
--     obs #137): "usuario | ... | INSERT: none (service role only)" already
--     specifies service_role must be able to INSERT usuario — that grant
--     was simply missing.
--   * Phase 4 admin invite/deactivate/reactivate (INSERT/UPDATE usuario,
--     INSERT registro_acceso for admin-triggered events) would have been
--     equally broken.
--
-- Mirrors the authenticated grant shape (see 0003_audit) for consistency
-- and to keep the same audit-column tamper-proofing (column-restricted
-- UPDATE, no DELETE anywhere — soft delete stays RPC-only). registro_acceso
-- stays append-only: SELECT + INSERT, no UPDATE/DELETE, for service_role
-- exactly as for authenticated.

grant select, insert on public.rol to service_role;
grant update (nombre, descripcion, permisos, activo) on public.rol to service_role;

grant select, insert on public.usuario to service_role;
grant update (nombre, email, rol_id, permisos_override, activo) on public.usuario to service_role;

grant select, insert on public.cliente to service_role;
grant update (nombre, tipo_cliente, responsable_interno_id, estado) on public.cliente to service_role;

grant select, insert on public.tarea to service_role;
grant update (titulo, descripcion, responsable_id, cliente_id, fecha_limite, estado, prioridad, etiquetas, origen) on public.tarea to service_role;

grant select, insert on public.registro_acceso to service_role;
