-- 0002_domain: cliente (foundation subset D2) + tarea (shared compromiso/tarea engine D3)
-- Source: sdd/platform-foundation/design (Engram obs #137) data model, verbatim.

create table public.cliente ( -- foundation subset ONLY (D2)
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo_cliente text, -- promoted to catalog FK by crm-module
  responsable_interno_id uuid references public.usuario(id),
  estado text not null default 'activo' check (estado in ('activo','inactivo','standby')),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz
);
create index cliente_responsable_idx on public.cliente(responsable_interno_id);

create table public.tarea ( -- ONE shared compromiso/tarea engine (D3)
  id bigint generated always as identity primary key,
  titulo text not null,
  descripcion text,
  responsable_id uuid references public.usuario(id), -- nullable ONLY in borrador (D4)
  cliente_id bigint references public.cliente(id),
  fecha_limite timestamptz,
  estado text not null default 'pendiente'
    check (estado in ('borrador','pendiente','en_curso','cumplido','cancelado')),
  prioridad text check (prioridad in ('Alta','Media','Baja')),
  etiquetas text[] not null default '{}',
  origen text not null check (origen in ('CRM','Kanban','Ambos')),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.usuario(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuario(id),
  deleted_at timestamptz,
  -- D4: cannot leave borrador without a responsable; borrador is the only
  -- state that allows responsable_id to be null.
  constraint borrador_sin_responsable check (estado = 'borrador' or responsable_id is not null)
);
create index tarea_responsable_idx on public.tarea(responsable_id);
create index tarea_cliente_idx on public.tarea(cliente_id);
create index tarea_vencidas_idx on public.tarea(fecha_limite) where deleted_at is null;
