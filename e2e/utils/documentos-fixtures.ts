import type { SupabaseClient } from "@supabase/supabase-js";

import {
  E2E_DOC_CATEGORIA,
  E2E_DOC_CATEGORIA_ETIQUETA,
  E2E_DOC_DENIED_EMAIL,
  E2E_DOC_DENIED_PASSWORD,
  E2E_DOC_NOEXPORT_EMAIL,
  E2E_DOC_NOEXPORT_PASSWORD,
  E2E_DOC_NOEXPORT_ROLE,
} from "../env";

/**
 * Provisions the documentos fixtures with the service-role client (task 8.1).
 *
 * Idempotent throughout, same posture as `global-setup.ts`'s admin user and
 * `scripts/bootstrap-admin.ts`: every step is a lookup-then-create, so the
 * suite is safe to re-run against a database that already has these rows.
 *
 * The single most important thing this file encodes: `private.categoria_visible`
 * has NO administrator bypass. It requires a `documento_categoria_permiso` row
 * for the caller's `rol_id`, full stop. So even the Administrador fixture must
 * be granted the category explicitly or the whole feature reads as empty —
 * which is also exactly why the product is unusable until an admin seeds a
 * category and grants it (open question 1).
 */

async function ensureRolId(
  supabase: SupabaseClient,
  nombre: string,
): Promise<number> {
  const { data: existing } = await supabase
    .from("rol")
    .select("id")
    .eq("nombre", nombre)
    .maybeSingle();

  if (existing) {
    return existing.id as number;
  }

  // documentos.ver/crear/editar so the user can reach and read the tab, but
  // exportar FALSE — this role exists to prove the zip gate is independent of
  // being able to read the documents it would archive.
  const { data: created, error } = await supabase
    .from("rol")
    .insert({
      nombre,
      descripcion:
        "E2E fixture: reads documentos in a granted category, cannot bulk-export.",
      permisos: {
        crm: {
          ver: true,
          crear: true,
          editar: true,
          eliminar: false,
          exportar: false,
        },
        kanban: {
          ver: false,
          crear: false,
          editar: false,
          eliminar: false,
          exportar: false,
        },
        documentos: {
          ver: true,
          crear: true,
          editar: true,
          eliminar: false,
          exportar: false,
        },
        dashboard: {
          ver: false,
          crear: false,
          editar: false,
          eliminar: false,
          exportar: false,
        },
        admin: {
          ver: false,
          crear: false,
          editar: false,
          eliminar: false,
          exportar: false,
        },
      },
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `E2E documentos fixtures: could not create the ${nombre} role: ` +
        `${error?.message ?? "unknown error"}`,
    );
  }

  return created.id as number;
}

async function ensureUser(
  supabase: SupabaseClient,
  {
    email,
    password,
    nombre,
    rolId,
  }: { email: string; password: string; nombre: string; rolId: number },
): Promise<void> {
  const { data: existing } = await supabase
    .from("usuario")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    // Keep the role authoritative: a previous run may have created this user
    // against a different fixture role.
    await supabase
      .from("usuario")
      .update({ rol_id: rolId })
      .eq("id", existing.id);
    return;
  }

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created?.user) {
    throw new Error(
      `E2E documentos fixtures: failed to create ${email}: ` +
        `${createError?.message ?? "unknown error"}`,
    );
  }

  const { error: insertError } = await supabase.from("usuario").insert({
    id: created.user.id,
    nombre,
    email,
    rol_id: rolId,
  });

  if (insertError) {
    throw new Error(
      `E2E documentos fixtures: auth user ${email} created but usuario ` +
        `insert failed: ${insertError.message}`,
    );
  }
}

async function ensureCategoria(supabase: SupabaseClient): Promise<void> {
  const { data: existing } = await supabase
    .from("catalogo")
    .select("codigo")
    .eq("tipo", "categoria_documento")
    .eq("codigo", E2E_DOC_CATEGORIA)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from("catalogo").insert({
    tipo: "categoria_documento",
    codigo: E2E_DOC_CATEGORIA,
    etiqueta: E2E_DOC_CATEGORIA_ETIQUETA,
    orden: 1,
  });

  if (error) {
    throw new Error(
      `E2E documentos fixtures: could not seed the ${E2E_DOC_CATEGORIA} ` +
        `category: ${error.message}`,
    );
  }
}

async function ensureGrant(
  supabase: SupabaseClient,
  rolId: number,
): Promise<void> {
  const { error } = await supabase
    .from("documento_categoria_permiso")
    .upsert(
      { rol_id: rolId, categoria: E2E_DOC_CATEGORIA },
      { onConflict: "rol_id,categoria", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(
      `E2E documentos fixtures: could not grant ${E2E_DOC_CATEGORIA} to ` +
        `rol ${rolId}: ${error.message}`,
    );
  }
}

async function requireSeededRolId(
  supabase: SupabaseClient,
  nombre: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("rol")
    .select("id")
    .eq("nombre", nombre)
    .single();

  if (error || !data) {
    throw new Error(
      `E2E documentos fixtures: could not find the ${nombre} role — has ` +
        `supabase/seed.sql been applied? ${error?.message ?? ""}`,
    );
  }

  return data.id as number;
}

export async function setUpDocumentosFixtures(
  supabase: SupabaseClient,
  adminRolId: number,
): Promise<void> {
  await ensureCategoria(supabase);

  // The Administrador fixture needs the grant like anyone else — no bypass.
  await ensureGrant(supabase, adminRolId);

  // Denied case: Coordinador already has documentos.ver/crear/editar in
  // seed.sql and is deliberately left WITHOUT a category grant, so any denial
  // this user hits is attributable to the category axis alone.
  const coordinadorRolId = await requireSeededRolId(supabase, "Coordinador");
  await ensureUser(supabase, {
    email: E2E_DOC_DENIED_EMAIL,
    password: E2E_DOC_DENIED_PASSWORD,
    nombre: "E2E Documentos Denegado",
    rolId: coordinadorRolId,
  });

  // No-export case: its own role, granted the category, exportar false.
  const lectorRolId = await ensureRolId(supabase, E2E_DOC_NOEXPORT_ROLE);
  await ensureGrant(supabase, lectorRolId);
  await ensureUser(supabase, {
    email: E2E_DOC_NOEXPORT_EMAIL,
    password: E2E_DOC_NOEXPORT_PASSWORD,
    nombre: "E2E Documentos Sin Exportar",
    rolId: lectorRolId,
  });
}
