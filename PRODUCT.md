# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal commercial/operations team members (seeded roles: Administrador, Gerencia, Coordinador, Colaborador). Muttu Hub is the first formal digitized tool for this workflow — there was no prior digitized process or competing CRM being replaced.

## Product Purpose

Internal operations platform covering: CRM (client/contact/opportunity/commitment/activity-log/task management), document management with role-and-category-based access, a kanban task board tied to CRM tasks, and an admin module (users, roles/permissions, access log, catalogs).

## Positioning

Exclusively internal. Built for a single company's own operation, with no intention of being offered to other companies or clients.

## Operating Context

- Roles and permissions are enforced via Postgres RLS plus a `has_permission` RPC (module × action: ver/crear/editar/eliminar/exportar); app-level route gating (e.g. `admin/layout.tsx`) is explicit defense-in-depth, not the real boundary.
- All user-facing copy lives in `src/messages/es.ts` (Spanish, Rioplatense-neutral).
- Domain vocabulary (Clientes, Oportunidades, valor estimado en COP) indicates a CRM/sales-pipeline tool, Colombia-based (COP currency).
- Routes: dashboard (KPIs), `/crm` + `/crm/[id]` (client detail with tabs: General, Contactos, Oportunidades, Compromisos, Bitácora, Tareas relacionadas, Documentos), `/kanban` (task board), `/admin/*` (usuarios, roles, accesos, catalogos, documentos).

## Capabilities and Constraints

- Role permission matrix (from `supabase/seed.sql`): Administrador has full access to all modules/actions; Gerencia has ver+exportar on crm/kanban/documentos/dashboard, no admin; Coordinador has ver/crear/editar on crm/kanban/documentos (no eliminar/exportar), ver-only dashboard, no admin; Colaborador has ver/crear on crm/kanban only, no documentos access.
- Document module supports upload, versioning, per-role category permissions, and zip download.
- Ownership-aware RLS for Colaborador editar permission is pending (currently seeded false).

## Brand Commitments

- Product name: "Muttu Hub".
- A brand/design-system reference was provided by the user at `/mnt/c/Users/Adrian/Downloads/muttu-hub-design-system.html`. It documents: brand color rose `#CD1560` (derived from the logo), display font "Bricolage Grotesque", UI font "Instrument Sans", data/code font "JetBrains Mono"; a token system for radius, shadow, and spacing; and a sidebar-nav pattern with a signature accent "riel" (rail) marker on the active link. Treated as binding visual evidence, not yet applied — see follow-up `/impeccable document` or `new-work` step.

## Evidence on Hand

- Existing incumbent implementation under `src/app/(app)/` using shadcn/ui components.
- `README.md`, `GUIA_DE_USO.md`, `DEMO_CHECKLIST.md`, `DEMO_VIDEO_SCRIPT.md` — internal docs and demo materials.
- No customer testimonials, case studies, or external press exist or should be fabricated (internal-only tool).

## Product Principles

- RLS-first security: the UI never implies a trust boundary Postgres RLS doesn't actually enforce.
- Role clarity: every screen reflects exactly what the active role's permission matrix allows — never implies a capability the role lacks.
- Operate-mode scanability: this is a task-completion tool, not a marketing surface — day-to-day efficiency outranks expressive design.
- Single source of truth for copy: all user-facing text lives in `src/messages/es.ts`.
- Internal-only scope: no multi-tenant or external-customer-facing assumptions.
