import { es } from "@/messages/es";
import {
  resolveUsuarioLabel,
  type UsuarioDirectory,
} from "@/lib/admin/directory";
import type { BitacoraEntry } from "@/lib/crm/queries";

interface BitacoraFeedProps {
  rows: BitacoraEntry[];
  directory: UsuarioDirectory;
}

/**
 * Bitácora feed (task 8.4, spec BIT1-BIT6). Purely presentational — rows
 * arrive PRE-SORTED newest-first from `listBitacora` (matching
 * `bitacora_cliente_idx (cliente_id, created_at desc)`); this component
 * never re-sorts. Renders NO edit/delete affordance for ANY entry,
 * regardless of the viewer's role or permissions (spec BIT5: corrections
 * to an entry are always new rows, never an edit) — unlike
 * `ContactosTable`/`OportunidadesTable`, which always render one, this
 * list has zero interactive controls at all.
 */
export function BitacoraFeed({ rows, directory }: BitacoraFeedProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.crm.bitacora.noEntries}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label={es.crm.tabs.bitacora}>
      {rows.map((row) => (
        <li key={row.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{resolveUsuarioLabel(directory, row.autorId)}</span>
            <span>{new Date(row.createdAt).toLocaleString("es-CO")}</span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{row.texto}</p>
        </li>
      ))}
    </ul>
  );
}
