import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Auth-gated shell layout (spec S4). middleware.ts already redirects
 * unauthenticated requests before they reach here (spec A5); this re-check
 * is defense in depth, not the security boundary — Postgres RLS is
 * (design decision "Security boundary"). Data access below stays
 * RLS-gated even if this check were ever bypassed.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuario } = await supabase
    .from("usuario")
    .select("nombre, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell
      userNombre={usuario?.nombre ?? user.email ?? ""}
      userEmail={usuario?.email ?? user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
