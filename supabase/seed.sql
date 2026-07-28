-- seed.sql — platform-foundation
--
-- Role permission matrix DERIVED from PRD §3.2 prose (the PRD contains no
-- literal matrix) and APPROVED by the user on 2026-07-27
-- (Engram obs #143, sdd/platform-foundation/delivery-decisions).
-- Values are adjustable post-launch via the admin module (Phase 4).
--
-- Approved matrix:
--   Administrador : all 5 actions on all 5 modules.
--   Gerencia      : ver + exportar on crm/kanban/documentos/dashboard; nothing on admin.
--   Coordinador   : ver/crear/editar on crm/kanban/documentos (no eliminar, no
--                   exportar); ver on dashboard; nothing on admin.
--   Colaborador   : ver/crear on crm/kanban. The approved text refines editar as
--                   "limited to own/assigned records enforced by RLS ownership".
--                   Ownership-aware policies are NOT part of platform-foundation
--                   (the design RLS matrix is permission-only, Engram obs #137);
--                   they arrive with the crm-module / kanban-module changes. The
--                   boolean grid is therefore seeded fail-closed
--                   (editar = false) until those policies exist.
--
-- Only the 4 roles are seeded here. The first admin user is provisioned by
-- scripts/bootstrap-admin.ts (service role, idempotent) — seeding auth.users
-- rows is intentionally avoided (design decision, Engram obs #137).

insert into public.rol (nombre, descripcion, permisos) values
(
  'Administrador',
  'Full access to every module and the admin area.',
  '{
    "crm":        {"ver": true, "crear": true, "editar": true, "eliminar": true, "exportar": true},
    "kanban":     {"ver": true, "crear": true, "editar": true, "eliminar": true, "exportar": true},
    "documentos": {"ver": true, "crear": true, "editar": true, "eliminar": true, "exportar": true},
    "dashboard":  {"ver": true, "crear": true, "editar": true, "eliminar": true, "exportar": true},
    "admin":      {"ver": true, "crear": true, "editar": true, "eliminar": true, "exportar": true}
  }'
),
(
  'Gerencia',
  'Read and export across operational modules; no admin access.',
  '{
    "crm":        {"ver": true, "crear": false, "editar": false, "eliminar": false, "exportar": true},
    "kanban":     {"ver": true, "crear": false, "editar": false, "eliminar": false, "exportar": true},
    "documentos": {"ver": true, "crear": false, "editar": false, "eliminar": false, "exportar": true},
    "dashboard":  {"ver": true, "crear": false, "editar": false, "eliminar": false, "exportar": true},
    "admin":      {"ver": false, "crear": false, "editar": false, "eliminar": false, "exportar": false}
  }'
),
(
  'Coordinador',
  'Creates and edits in crm/kanban/documentos; reads dashboard; no admin access.',
  '{
    "crm":        {"ver": true, "crear": true, "editar": true, "eliminar": false, "exportar": false},
    "kanban":     {"ver": true, "crear": true, "editar": true, "eliminar": false, "exportar": false},
    "documentos": {"ver": true, "crear": true, "editar": true, "eliminar": false, "exportar": false},
    "dashboard":  {"ver": true, "crear": false, "editar": false, "eliminar": false, "exportar": false},
    "admin":      {"ver": false, "crear": false, "editar": false, "eliminar": false, "exportar": false}
  }'
),
(
  'Colaborador',
  'Reads and creates in crm/kanban. Edit of own/assigned records pending ownership-aware RLS (crm/kanban modules); seeded fail-closed.',
  '{
    "crm":        {"ver": true, "crear": true, "editar": false, "eliminar": false, "exportar": false},
    "kanban":     {"ver": true, "crear": true, "editar": false, "eliminar": false, "exportar": false},
    "documentos": {"ver": false, "crear": false, "editar": false, "eliminar": false, "exportar": false},
    "dashboard":  {"ver": false, "crear": false, "editar": false, "eliminar": false, "exportar": false},
    "admin":      {"ver": false, "crear": false, "editar": false, "eliminar": false, "exportar": false}
  }'
)
on conflict (nombre) do nothing;
