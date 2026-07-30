import type { Metadata } from "next";

import { es } from "@/messages/es";
import { listRoles } from "@/lib/admin/directory";
import { listCategoryGrants } from "@/lib/admin/category-grants";
import { getCatalogoOptions } from "@/lib/crm/catalogos";
import { CategoryGrantsEditor } from "./category-grants-editor";

export const metadata: Metadata = {
  title: `${es.admin.categoryGrants.title} · ${es.admin.title} · ${es.common.appName}`,
};

/**
 * Admin screen for document category grants (task 7.1/7.2, spec
 * document-permissions). Admin-only twice over: `(app)/admin/layout.tsx` gates
 * the route, and `documento_categoria_permiso`'s own INSERT/DELETE policies
 * independently require `admin.editar`, so a caller who reaches the actions by
 * any other path is still refused.
 *
 * Passes EVERY `categoria_documento` code, not `activeCatalogoOptions` — a
 * grant on a deactivated code must stay visible and revocable here. The
 * catalog ships empty (design Decision 8), so until an admin seeds real codes
 * this screen is the empty-state guidance rather than a grid.
 */
export default async function AdminDocumentosPage() {
  const [roles, catalogoOptions, grants] = await Promise.all([
    listRoles(),
    getCatalogoOptions(),
    listCategoryGrants(),
  ]);

  const categorias = catalogoOptions.get("categoria_documento") ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          {es.admin.categoryGrants.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {es.admin.categoryGrants.description}
        </p>
      </div>
      <CategoryGrantsEditor
        roles={roles}
        categorias={categorias}
        grants={grants}
      />
    </div>
  );
}
