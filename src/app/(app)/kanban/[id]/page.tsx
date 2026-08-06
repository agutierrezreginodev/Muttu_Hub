import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { es } from "@/messages/es";
import {
  getUsuarioDirectory,
  resolveUsuarioLabel,
} from "@/lib/admin/directory";
import { getCatalogoOptions, resolveCatalogoLabel } from "@/lib/crm/catalogos";
import { COLUMNA_TIPO } from "@/lib/kanban/columnas";
import { getTareaDetalle, listComentarios } from "@/lib/kanban/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComentarioFeed } from "./comentario-feed";
import { ComentarioForm } from "./comentario-form";

export const metadata: Metadata = {
  title: `${es.kanban.title} · ${es.common.appName}`,
};

interface TareaDetallePageProps {
  params: Promise<{ id: string }>;
}

const DASH = "—";

/**
 * Card detail + comment thread (slice 7, spec KM1). This route is also the
 * bell's deep-link target (slice 10), which is why `getTareaDetalle` does NOT
 * filter by origen: the bell reports on every origen the caller can see, and an
 * origen filter here would 404 a notification's own link.
 *
 * An id RLS hid is a 404, never a "no tenés permiso": distinguishing the two
 * would confirm the row exists to someone who cannot see it. A non-numeric id is
 * a 404 for the same reason, before any query runs.
 */
export default async function TareaDetallePage({
  params,
}: TareaDetallePageProps) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const tareaId = Number.parseInt(id, 10);
  const tarea = await getTareaDetalle(tareaId);

  if (!tarea) {
    notFound();
  }

  const [comentarios, directory, catalogo] = await Promise.all([
    listComentarios(tareaId),
    getUsuarioDirectory(),
    getCatalogoOptions(),
  ]);

  const columnaLabel = tarea.columna
    ? resolveCatalogoLabel(catalogo, COLUMNA_TIPO, tarea.columna)
    : DASH;

  const campos: { label: string; value: string }[] = [
    {
      label: es.kanban.tarjeta.responsable,
      value: resolveUsuarioLabel(directory, tarea.responsableId),
    },
    { label: es.kanban.lista.columna, value: columnaLabel },
    { label: es.kanban.detalle.estado, value: tarea.estado },
    { label: es.kanban.detalle.origen, value: tarea.origen },
    {
      label: es.kanban.tarjeta.fechaLimite,
      value: tarea.fechaLimite
        ? new Date(tarea.fechaLimite).toLocaleDateString("es-CO")
        : es.kanban.tarjeta.sinFecha,
    },
    { label: es.kanban.tarjeta.prioridad, value: tarea.prioridad ?? DASH },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/kanban"
        className="text-sm text-muted-foreground hover:underline"
      >
        {es.kanban.detalle.volver}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            {tarea.titulo}
            {tarea.vencido ? (
              <Badge variant="destructive">{es.kanban.tarjeta.vencida}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {tarea.descripcion ?? es.kanban.detalle.sinDescripcion}
          </p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {campos.map((campo) => (
              <div key={campo.label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{campo.label}</dt>
                <dd className="text-sm">{campo.value}</dd>
              </div>
            ))}
          </dl>
          {tarea.etiquetas.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tarea.etiquetas.map((etiqueta) => (
                <Badge key={etiqueta} variant="ghost">
                  {etiqueta}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {es.kanban.comentarios.titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ComentarioForm tareaId={tareaId} />
          <ComentarioFeed rows={comentarios} directory={directory} />
        </CardContent>
      </Card>
    </div>
  );
}
