import Link from "next/link";

import { es } from "@/messages/es";
import type { CatalogoPickerOption } from "@/lib/kanban/columnas";
import {
  FILTER_PARAMS,
  FLAG_ON,
  SCOPE_PARAM,
  buildBoardHref,
  type BoardFilterValues,
  type ClienteOption,
  type SearchParamsRecord,
} from "@/lib/kanban/filtros";
import type { UsuarioOption } from "@/lib/admin/directory-options";
import { Button } from "@/components/ui/button";

interface BoardFiltersProps {
  values: BoardFilterValues;
  params: SearchParamsRecord;
  /** The view these filters belong to — board or list (KV1). */
  basePath: string;
  usuarioOptions: UsuarioOption[];
  prioridadOptions: CatalogoPickerOption[];
  etiquetaOptions: CatalogoPickerOption[];
  clienteOptions: ClienteOption[];
}

const selectClass =
  "h-11 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base";

/**
 * KV1's filter set for both the board and the list view.
 *
 * A plain GET form, following `crm/page.tsx`'s shipped search: submitting is a
 * NAVIGATION, so the result is server-rendered through RLS, deep-linkable,
 * back-button correct, and works with no client JS.
 *
 * Native `<select>` and `<input type="checkbox">` rather than the shadcn `Select`
 * used in the dialogs, and that is a requirement rather than a shortcut: the kit's
 * Select is a button plus a popup, which posts no value in a GET form. The
 * dialogs can use it because they submit through a server action instead.
 *
 * `scope` rides along in a hidden field. Scope and filters share one URL but are
 * separate intents — without it, submitting a filter would silently drop the user
 * out of "Mi tablero".
 */
export function BoardFilters({
  values,
  params,
  basePath,
  usuarioOptions,
  prioridadOptions,
  etiquetaOptions,
  clienteOptions,
}: BoardFiltersProps) {
  const hasFilters =
    values.responsableId !== undefined ||
    values.prioridad !== undefined ||
    values.etiqueta !== undefined ||
    values.clienteId !== undefined ||
    values.vencidas ||
    values.sinFecha;

  const clearHref = buildBoardHref(
    basePath,
    { [SCOPE_PARAM]: params[SCOPE_PARAM] },
    {},
  );

  return (
    <form
      method="get"
      action={basePath}
      aria-label={es.kanban.filtros.label}
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3"
    >
      <input type="hidden" name={SCOPE_PARAM} value={values.scope} />

      <div className="flex min-w-40 flex-col gap-1.5">
        <label
          htmlFor="board-filter-responsable"
          className="text-sm font-medium"
        >
          {es.kanban.filtros.responsable}
        </label>
        <select
          id="board-filter-responsable"
          name={FILTER_PARAMS.responsable}
          defaultValue={values.responsableId ?? ""}
          className={selectClass}
        >
          <option value="">{es.kanban.filtros.todos}</option>
          {usuarioOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label htmlFor="board-filter-prioridad" className="text-sm font-medium">
          {es.kanban.filtros.prioridad}
        </label>
        <select
          id="board-filter-prioridad"
          name={FILTER_PARAMS.prioridad}
          defaultValue={values.prioridad ?? ""}
          className={selectClass}
        >
          <option value="">{es.kanban.filtros.todas}</option>
          {prioridadOptions.map((option) => (
            <option key={option.codigo} value={option.codigo}>
              {option.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-32 flex-col gap-1.5">
        <label htmlFor="board-filter-etiqueta" className="text-sm font-medium">
          {es.kanban.filtros.etiqueta}
        </label>
        <select
          id="board-filter-etiqueta"
          name={FILTER_PARAMS.etiqueta}
          defaultValue={values.etiqueta ?? ""}
          className={selectClass}
        >
          <option value="">{es.kanban.filtros.todas}</option>
          {etiquetaOptions.map((option) => (
            <option key={option.codigo} value={option.codigo}>
              {option.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-40 flex-col gap-1.5">
        <label htmlFor="board-filter-cliente" className="text-sm font-medium">
          {es.kanban.filtros.cliente}
        </label>
        <select
          id="board-filter-cliente"
          name={FILTER_PARAMS.cliente}
          defaultValue={
            values.clienteId !== undefined ? String(values.clienteId) : ""
          }
          className={selectClass}
        >
          <option value="">{es.kanban.filtros.todos}</option>
          {clienteOptions.map((option) => (
            <option key={option.id} value={String(option.id)}>
              {option.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        <div className="flex items-center gap-2">
          <input
            id="board-filter-vencidas"
            type="checkbox"
            name={FILTER_PARAMS.vencidas}
            value={FLAG_ON}
            defaultChecked={values.vencidas}
            className="h-4 w-4"
          />
          <label htmlFor="board-filter-vencidas" className="text-sm">
            {es.kanban.filtros.vencidas}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="board-filter-sin-fecha"
            type="checkbox"
            name={FILTER_PARAMS.sinFecha}
            value={FLAG_ON}
            defaultChecked={values.sinFecha}
            className="h-4 w-4"
          />
          <label htmlFor="board-filter-sin-fecha" className="text-sm">
            {es.kanban.filtros.sinFecha}
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 pb-1">
        <Button type="submit" className="h-11 min-h-11">
          {es.kanban.filtros.aplicar}
        </Button>
        {hasFilters ? (
          <Link
            href={clearHref}
            className="flex h-11 min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent/50"
          >
            {es.kanban.filtros.limpiar}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
