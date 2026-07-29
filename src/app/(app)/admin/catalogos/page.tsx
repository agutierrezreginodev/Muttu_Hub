import type { Metadata } from "next";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { CatalogoTable, type CatalogoRow } from "./catalogo-table";
import { CatalogoFormDialog } from "./catalogo-form-dialog";

export const metadata: Metadata = {
  title: `${es.admin.catalogos.title} · ${es.admin.title} · ${es.common.appName}`,
};

/**
 * Admin catálogos (task 5.5, spec §4.7/CAT4). Reads the BASE `catalogo`
 * table, not `v_catalogo` — this screen needs inactive rows too (the same
 * reason the roles screen reads `rol` directly instead of an active-only
 * view). Grouped by `tipo` (design "admin catálogos screen ... filterable/
 * grouped by tipo").
 */
export default async function CatalogosPage() {
  const supabase = await createClient();

  const [{ data: rows }, directory] = await Promise.all([
    supabase
      .from("catalogo")
      .select(
        "tipo, codigo, etiqueta, orden, activo, created_at, created_by, updated_at, updated_by",
      )
      .order("tipo")
      .order("orden")
      .order("etiqueta"),
    getUsuarioDirectory(),
  ]);

  const catalogoRows: CatalogoRow[] = (rows ?? []).map((row) => ({
    tipo: row.tipo,
    codigo: row.codigo,
    etiqueta: row.etiqueta,
    orden: row.orden,
    activo: row.activo,
    createdAt: row.created_at,
    createdBy: resolveUsuarioLabel(directory, row.created_by),
    updatedAt: row.updated_at,
    updatedBy: resolveUsuarioLabel(directory, row.updated_by),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{es.admin.catalogos.title}</h1>
        <CatalogoFormDialog mode="create" />
      </div>
      <CatalogoTable rows={catalogoRows} />
    </div>
  );
}
