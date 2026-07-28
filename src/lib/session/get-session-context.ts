import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { mergePermissions, type PermisosGrid } from "@/lib/permissions";

export interface SessionContext {
  userId: string;
  nombre: string;
  email: string;
  rolId: number;
  rolNombre: string;
  /** Merged (role + override) grid — UI-side read helper only, see mergePermissions. */
  permisos: PermisosGrid;
}

/**
 * Server-side session context (task 4.1): who is logged in, their role,
 * and their EFFECTIVE permission grid. `cache()`-wrapped so every Server
 * Component in the same request (layout, page) that calls this shares one
 * Supabase round trip instead of re-querying.
 *
 * UI-side read helper ONLY (design: "Role resolution: server helper
 * getSessionContext() ... merges override/role for UI only"). Use this to
 * decide what to render — never to gate a mutation or a route. The actual
 * security boundary is Postgres RLS / private.has_permission() (design
 * decision "Security boundary"); route gates call the public.has_permission
 * RPC directly (see (app)/admin/layout.tsx), not this helper.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: usuario } = await supabase
      .from("v_usuario_activo")
      .select("nombre, email, rol_id, permisos_override")
      .eq("id", user.id)
      .maybeSingle();

    if (!usuario) {
      return null;
    }

    const { data: rol } = await supabase
      .from("rol")
      .select("nombre, permisos")
      .eq("id", usuario.rol_id)
      .maybeSingle();

    const permisos = mergePermissions(rol?.permisos, usuario.permisos_override);

    return {
      userId: user.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rolId: usuario.rol_id,
      rolNombre: rol?.nombre ?? "",
      permisos,
    };
  },
);
