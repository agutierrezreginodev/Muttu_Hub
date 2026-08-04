/**
 * scripts/bootstrap-admin.ts
 *
 * Provisions the FIRST Administrador user for a Muttu Hub environment.
 *
 * Why this script exists (design decision "First-admin provisioning",
 * Engram sdd/platform-foundation/design obs #137): supabase/seed.sql only
 * loads the 4 roles (Administrador, Gerencia, Coordinador, Colaborador). It
 * deliberately does NOT insert into auth.users — seeding Supabase Auth rows
 * directly is fragile across Supabase versions and environments. This script
 * uses the service-role Admin API instead: the same invite-by-email
 * mechanism the admin module later uses for every other user (spec U8,
 * "Admins never know passwords").
 *
 * SAFETY
 * - Requires SUPABASE_SERVICE_ROLE_KEY. This key BYPASSES Row Level Security
 *   and must NEVER be exposed to the browser (never prefixed NEXT_PUBLIC_ —
 *   see .env.example). Run this script server-side / from a trusted shell
 *   only (local dev bootstrap, CI provisioning job, or a one-off ops run).
 *   It is never imported by the Next.js app.
 * - Idempotent: safe to re-run. If a usuario row already exists for the
 *   target email, or an active Administrador already exists in this
 *   environment, the script reports the existing state and exits 0 without
 *   inviting a duplicate or creating a second admin from this path.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     pnpm bootstrap:admin --email admin@example.com --nombre "Admin Principal"
 *
 * ENV VARS
 *   NEXT_PUBLIC_SUPABASE_URL     Project URL (e.g. http://127.0.0.1:54321 for local dev).
 *                                Not a secret; reused from .env.example on purpose.
 *   SUPABASE_SERVICE_ROLE_KEY    Service-role key. Server-only, never NEXT_PUBLIC_.
 *   NEXT_PUBLIC_SITE_URL         Public app origin the invite link should point the
 *                                user back to (e.g. http://127.0.0.1:3000 for local
 *                                dev). Defaults to that. The redirect chain
 *                                SITE → /auth/callback?next=/actualizar-clave mirrors
 *                                the admin-module invite (src/lib/admin/actions.ts)
 *                                and the recovery flow (src/lib/auth/actions.ts), so
 *                                first-time invitees land on the "set password" form
 *                                instead of an authenticated home with no password.
 *
 * CLI FLAGS
 *   --email   <email>    Required. Email of the first administrator.
 *   --nombre  <nombre>   Optional. Display name (default: "Administrador").
 */

import { createClient } from "@supabase/supabase-js";

interface CliArgs {
  email?: string;
  nombre?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for flag --${key}`);
      }
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const { email, nombre = "Administrador" } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error(
      "Usage: pnpm bootstrap:admin --email <email> [--nombre <nombre>]",
    );
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. This script must " +
        "run with the service-role key (bypasses RLS) — never the anon/publishable key, and " +
        "never from browser code.",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rol, error: rolError } = await supabase
    .from("rol")
    .select("id")
    .eq("nombre", "Administrador")
    .single();

  if (rolError || !rol) {
    console.error(
      "Could not find the Administrador role. Has supabase/seed.sql been applied " +
        "(supabase db reset, or a migration deploy)?",
      rolError?.message,
    );
    process.exitCode = 1;
    return;
  }

  // Idempotency check #1: does this email already have a usuario profile?
  const { data: existingUsuario, error: existingUsuarioError } = await supabase
    .from("usuario")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (existingUsuarioError) {
    console.error(
      "Failed to check for an existing usuario row:",
      existingUsuarioError.message,
    );
    process.exitCode = 1;
    return;
  }

  if (existingUsuario) {
    console.log(
      `Nothing to do: ${email} already exists as usuario ${existingUsuario.id}.`,
    );
    return;
  }

  // Idempotency check #2: is there already an active Administrador in this
  // environment? Re-running this script should not mint a second one — use
  // the admin module's invite flow for every subsequent user (U8).
  const { data: existingAdmins, error: existingAdminsError } = await supabase
    .from("usuario")
    .select("id, email")
    .eq("rol_id", rol.id)
    .is("deleted_at", null)
    .limit(1);

  if (existingAdminsError) {
    console.error(
      "Failed to check for an existing Administrador:",
      existingAdminsError.message,
    );
    process.exitCode = 1;
    return;
  }

  if (existingAdmins && existingAdmins.length > 0) {
    console.log(
      `Nothing to do: an Administrador already exists (${existingAdmins[0].email}). ` +
        `Use the admin module to invite ${email} instead of re-running this script.`,
    );
    return;
  }

  // Same mechanism the admin module later uses for every other user (U8):
  // invite by email, invitee sets their own password server-side. Admins
  // never know passwords (design decision "Account creation").
  //
  // redirectTo must point at the APP origin, not the GoTrue origin — the
  // verify URL Kong will redirect to is `${SITE_URL}/auth/callback?next=...`,
  // and the callback (src/app/auth/callback/page.tsx) reads `next` to decide
  // where to drop the now-authenticated user. Without `next=/actualizar-clave`
  // here, the invitee lands on `/` with a session but no password set
  // (GOTRUE_MAILER_AUTOCONFIRM=true in the local stack auto-confirms without
  // ever surfacing a set-password form).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const { data: invited, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/actualizar-clave`,
    });

  if (inviteError || !invited?.user) {
    console.error(
      "Failed to invite the first administrator:",
      inviteError?.message,
    );
    process.exitCode = 1;
    return;
  }

  const { error: insertError } = await supabase.from("usuario").insert({
    id: invited.user.id,
    nombre,
    email,
    rol_id: rol.id,
  });

  if (insertError) {
    console.error(
      `Auth invite succeeded but the usuario profile insert failed. Manual cleanup may be ` +
        `needed for auth user ${invited.user.id}:`,
      insertError.message,
    );
    process.exitCode = 1;
    return;
  }

  const { error: registroError } = await supabase
    .from("registro_acceso")
    .insert({ usuario_id: invited.user.id, evento: "invitacion" });

  if (registroError) {
    console.warn(
      "Administrador provisioned, but writing the registro_acceso entry failed (non-fatal):",
      registroError.message,
    );
  }

  console.log(
    `Invited the first Administrador: ${email} (usuario ${invited.user.id}).`,
  );
}

main().catch((error: unknown) => {
  console.error("Unexpected error while bootstrapping the first admin:", error);
  process.exitCode = 1;
});
