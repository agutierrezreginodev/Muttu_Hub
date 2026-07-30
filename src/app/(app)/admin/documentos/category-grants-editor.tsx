"use client";

import { useState, useTransition } from "react";

import { es } from "@/messages/es";
import {
  grantCategoryAction,
  revokeCategoryAction,
} from "@/lib/admin/category-grants-actions";
import type { RolOption } from "@/lib/admin/directory-options";
import type { CatalogoOption } from "@/lib/crm/catalogo-options";
import { toast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CategoryGrantsEditorProps {
  roles: RolOption[];
  /** ALL `categoria_documento` codes, not only active ones — see the doc comment. */
  categorias: CatalogoOption[];
  grants: Map<number, Set<string>>;
}

function cellKey(rolId: number, categoria: string): string {
  return `${rolId}:${categoria}`;
}

function toCellSet(grants: Map<number, Set<string>>): Set<string> {
  const cells = new Set<string>();
  for (const [rolId, categorias] of grants) {
    for (const categoria of categorias) {
      cells.add(cellKey(rolId, categoria));
    }
  }
  return cells;
}

/**
 * Role × category grant grid (task 7.1/7.2, spec document-permissions
 * "Category grants are admin-managed"). Mirrors
 * `PermissionsGridEditor`'s shape — one control per cell rather than a raw
 * JSON blob — except each cell here writes immediately instead of being part
 * of a form submit, because a grant is a single independent row.
 *
 * Grants are held in local state seeded from props so a toggle shows at once
 * and does not wait for the revalidate to come back. A REJECTED write reverts
 * the cell: leaving it ticked would show an admin a permission that was never
 * written, which is the one failure mode that actively misleads on a
 * permissions screen.
 *
 * The grid lists roles regardless of `rol.activo`, marking the inactive ones.
 * `private.categoria_visible` does NOT gate on `rol.activo` (design Decision
 * 4), so an inactive role's grants are still live — hiding them would hide
 * effective access. Columns likewise cover EVERY `categoria_documento` code
 * rather than only active ones, so a grant on a deactivated code stays visible
 * and revocable instead of silently disappearing from the screen.
 */
export function CategoryGrantsEditor({
  roles,
  categorias,
  grants,
}: CategoryGrantsEditorProps) {
  const [granted, setGranted] = useState<Set<string>>(() => toCellSet(grants));
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  if (categorias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.admin.categoryGrants.noCategories}
      </p>
    );
  }

  function setCell(key: string, value: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      if (value) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function toggle(rolId: number, categoria: string, nextValue: boolean) {
    const key = cellKey(rolId, categoria);
    setError(undefined);
    setCell(key, nextValue);

    startTransition(async () => {
      const result = nextValue
        ? await grantCategoryAction(rolId, categoria)
        : await revokeCategoryAction(rolId, categoria);

      if (result.error) {
        setCell(key, !nextValue);
        setError(result.error);
        return;
      }

      toast.add({
        title: nextValue
          ? es.admin.categoryGrants.grantSuccess
          : es.admin.categoryGrants.revokeSuccess,
        type: "success",
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{es.admin.categoryGrants.rol}</TableHead>
            {categorias.map((categoria) => (
              <TableHead key={categoria.codigo}>{categoria.etiqueta}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((rol) => (
            <TableRow key={rol.id}>
              <TableCell className="font-medium">
                {rol.nombre}
                {rol.activo ? null : (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {es.admin.inactive}
                  </span>
                )}
              </TableCell>
              {categorias.map((categoria) => {
                const checked = granted.has(cellKey(rol.id, categoria.codigo));
                return (
                  <TableCell key={categoria.codigo}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`${rol.nombre} — ${categoria.etiqueta}`}
                      checked={checked}
                      disabled={isPending}
                      onChange={(event) =>
                        toggle(rol.id, categoria.codigo, event.target.checked)
                      }
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
