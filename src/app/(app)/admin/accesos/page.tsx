import type { Metadata } from "next";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: `${es.admin.accessLog} · ${es.admin.title} · ${es.common.appName}`,
};

const EVENT_LABELS: Record<string, string> = {
  login: es.admin.eventLogin,
  logout: es.admin.eventLogout,
  invitacion: es.admin.eventInvitacion,
  desactivacion: es.admin.eventDesactivacion,
  reactivacion: es.admin.eventReactivacion,
};

const ACCESS_LOG_LIMIT = 200;

/**
 * registro_acceso viewer (task 4.8, spec U7): admin-only (gated by
 * (app)/admin/layout.tsx AND the table's own registro_acceso_select policy,
 * which independently requires has_permission('admin','ver')). Read-only —
 * the log is append-only by design, so there is nothing to edit here.
 */
export default async function AccesosPage() {
  const supabase = await createClient();

  const [{ data: registros }, directory] = await Promise.all([
    supabase
      .from("registro_acceso")
      .select("id, usuario_id, evento, created_at")
      .order("created_at", { ascending: false })
      .limit(ACCESS_LOG_LIMIT),
    getUsuarioDirectory(),
  ]);

  const rows = registros ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.admin.accessLog}</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {es.admin.noAccessLogEntries}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{es.admin.name}</TableHead>
              <TableHead>{es.admin.event}</TableHead>
              <TableHead>{es.admin.createdAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((registro) => (
              <TableRow key={registro.id}>
                <TableCell className="font-medium">
                  {resolveUsuarioLabel(directory, registro.usuario_id)}
                </TableCell>
                <TableCell>
                  {EVENT_LABELS[registro.evento] ?? registro.evento}
                </TableCell>
                <TableCell
                  className="text-sm text-muted-foreground"
                  title={registro.created_at}
                >
                  {new Date(registro.created_at).toLocaleString("es")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
