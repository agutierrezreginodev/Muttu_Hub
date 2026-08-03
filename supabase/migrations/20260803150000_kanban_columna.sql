-- supabase/migrations/20260803150000_kanban_columna.sql
--
-- Add `columna` to `tarea` (kanban-module slice 4a/4b).
--
-- WHY THIS MIGRATION EXISTS
-- The kanban-module slice 4a added the pure column-helpers (COLUMNA_TIPO,
-- groupTareasByColumna, fallbackColumna) and slice 4b's listBoardTareas
-- queries `v_tarea` selecting `columna`. But the column itself was never
-- added to the tarea table in any committed migration, and v_tarea's
-- definition in supabase/migrations/20260728041925_audit.sql does NOT
-- include `columna` either.
--
-- Result before this fix: the kanban board at /kanban returned a
-- PostgREST `column "columna" does not exist` 500 on every load. The
-- module compiled (string-built queries) but blew up at runtime.
--
-- This migration closes the gap with the same pinned-discriminator
-- pattern that crm_catalogos.sql used for `prioridad`: the column itself
-- is nullable (KC3: a kanban tarea with `columna is null` renders in the
-- lowest-`orden` ACTIVE column), the discriminator is NOT NULL with the
-- matching `columna_tablero` default, and the FK is to catalogo(tipo, codigo)
-- so the kanban board's lane codes are governed by the catalog module
-- (not by hardcoded enums).
--
-- The view is rebuilt to include `columna` — `v_tarea` was created without
-- it, but the kanban queries select it; rebuilding (CREATE OR REPLACE)
-- keeps the existing grants and security_invoker flag intact.
--
-- Idempotency: safe to re-run. `add column if not exists` and the
-- `drop constraint if exists` / `add constraint` pair make every DDL
-- statement a no-op on a second run.

-- ---------------------------------------------------------------------------
-- 1. Column + discriminator
-- ---------------------------------------------------------------------------
alter table public.tarea
  add column if not exists columna text,
  add column if not exists columna_cat_tipo text not null default 'columna_tablero'
    check (columna_cat_tipo = 'columna_tablero');

-- ---------------------------------------------------------------------------
-- 2. FK to catalogo (same shape as tarea_prioridad_fk)
-- ---------------------------------------------------------------------------
alter table public.tarea
  drop constraint if exists tarea_columna_fk;

alter table public.tarea
  add constraint tarea_columna_fk
    foreign key (columna_cat_tipo, columna)
    references public.catalogo (tipo, codigo)
    on update restrict on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Rebuild v_tarea to expose `columna` to the kanban board
-- ---------------------------------------------------------------------------
-- The original view (20260728041925_audit.sql) was created without
-- `columna`. The kanban board's listBoardTareas() queries
-- `v_tarea(... columna ...)`; without this rebuild, that query 500s.
--
-- CREATE OR REPLACE preserves the view's column list ordering for existing
-- consumers and re-runs the security_invoker setting; the only behavioural
-- change is the new trailing column.
create or replace view public.v_tarea
with (security_invoker = true) as
  select id, titulo, descripcion, responsable_id, cliente_id, fecha_limite,
         estado, prioridad, etiquetas, origen,
         created_at, created_by, updated_at, updated_by,
         (fecha_limite is not null and fecha_limite < now()
          and estado not in ('cumplido','cancelado')) as vencido,
         columna
  from public.tarea
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. Grants — v_tarea's grants are already in place from the original
--    migration. CREATE OR REPLACE VIEW does NOT revoke existing grants,
--    so authenticated's SELECT on v_tarea is preserved.
-- ---------------------------------------------------------------------------
-- (Intentionally no grant statements here — see 20260728041925_audit.sql
-- for the original grant block. Re-stating it would risk drift if the
-- original block ever changes role names.)
