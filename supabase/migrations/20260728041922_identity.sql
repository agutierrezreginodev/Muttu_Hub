-- 0001_identity: private schema, rol (permisos CHECK), usuario, FK indexes
-- Source: sdd/platform-foundation/design (Engram obs #137) data model, verbatim.

create schema private;

-- Full-grid validator for rol.permisos: every module key present, every
-- module an object carrying the 5 action keys, every action a boolean.
-- DEVIATION (mechanics, not semantics): the design DDL puts this logic
-- inline in the CHECK, but Postgres forbids subqueries in CHECK constraints
-- (SQLSTATE 0A000). The identical logic lives in this IMMUTABLE function and
-- the CHECK calls it. Kept executable by PUBLIC (default) so constrained
-- INSERT/UPDATE statements by authenticated evaluate it without extra
-- grants; it is pure validation over its argument.
create or replace function private.permisos_grid_valid(permisos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(permisos) = 'object'
    and permisos ?& array['crm','kanban','documentos','dashboard','admin']
    and (select bool_and(
           jsonb_typeof(v) = 'object'
           and v ?& array['ver','crear','editar','eliminar','exportar']
           and (select bool_and(jsonb_typeof(a) = 'boolean') from jsonb_each(v) x(ak,a))
         ) from jsonb_each(permisos) e(k,v));
$$;

create table public.rol (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  permisos jsonb not null default '{}',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint permisos_shape check (private.permisos_grid_valid(permisos))
);

create table public.usuario ( -- profile, 1:1 with auth.users
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null unique,
  rol_id bigint not null references public.rol(id),
  permisos_override jsonb, -- partial grid; key present beats role (U4); fail-closed
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);
create index usuario_rol_id_idx on public.usuario(rol_id); -- FK index rule
