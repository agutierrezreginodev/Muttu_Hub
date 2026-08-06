import { es } from "@/messages/es";
import {
  resolveUsuarioLabel,
  type UsuarioDirectory,
} from "@/lib/admin/directory-options";
import type { ComentarioEntry } from "@/lib/kanban/queries";

interface ComentarioFeedProps {
  rows: ComentarioEntry[];
  directory: UsuarioDirectory;
}

/**
 * Comment thread (spec KM1/KM2, design D8). Mirrors `bitacora-feed.tsx`: rows
 * arrive PRE-SORTED newest-first from `listComentarios` (matching
 * `tarea_comentario_idx (tarea_id, created_at desc)`) and this component never
 * re-sorts them.
 *
 * It renders NO edit or delete affordance for any comment, for any viewer,
 * including an administrador — and that is not a UI preference. KM2's
 * immutability lives at the GRANT layer: `tarea_comentario` has no UPDATE or
 * DELETE grant for any role, so such a control could only ever produce a 42501.
 * A correction is a new comment, exactly as a bitácora correction is a new entry.
 */
export function ComentarioFeed({ rows, directory }: ComentarioFeedProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {es.kanban.comentarios.noEntries}
      </p>
    );
  }

  return (
    <ul
      className="flex flex-col gap-3"
      aria-label={es.kanban.comentarios.titulo}
    >
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
