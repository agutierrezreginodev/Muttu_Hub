import type { Metadata } from "next";

import { es } from "@/messages/es";
import { getResumenDiarioPreferencia } from "@/lib/notificaciones/preferencias/queries";
import { PreferenciasForm } from "./preferencias-form";

export const metadata: Metadata = {
  title: `${es.preferencias.title} · ${es.common.appName}`,
};

/**
 * Personal preferences (slice 13). Deliberately ungated: this page edits only
 * the caller's own row, so it needs no permission module — and `MODULOS`
 * staying unchanged is one of the kanban change's own success criteria. The
 * boundary here is RLS on `notificacion_preferencia`, not a route guard.
 */
export default async function PreferenciasPage() {
  const resumenDiarioEmail = await getResumenDiarioPreferencia();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{es.preferencias.title}</h1>
      <PreferenciasForm resumenDiarioEmail={resumenDiarioEmail} />
    </div>
  );
}
