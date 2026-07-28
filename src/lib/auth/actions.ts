"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  recoverySchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";

export interface AuthActionState {
  error?: string;
}

/**
 * Login (spec A1/A5). Only path to a session — no public signup. On
 * success, writes a registro_acceso('login') row using the caller's own
 * fresh session (RLS policy: registro_acceso INSERT is own-row-only), then
 * redirects home. On failure, returns a natural-language error (spec S2) —
 * never leaks whether the account or password was wrong.
 */
export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? es.common.genericError,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: es.auth.invalidCredentials };
  }

  const { error: registroError } = await supabase
    .from("registro_acceso")
    .insert({ usuario_id: data.user.id, evento: "login" });

  if (registroError) {
    console.error(
      "Failed to write registro_acceso(login):",
      registroError.message,
    );
  }

  redirect("/");
}

/**
 * Logout. Writes a registro_acceso('logout') row before invalidating the
 * session (the insert needs auth.uid() to still resolve), then redirects
 * to /login. Bound directly as a <form action={logoutAction}> — no client
 * state needed.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error } = await supabase
      .from("registro_acceso")
      .insert({ usuario_id: user.id, evento: "logout" });

    if (error) {
      console.error("Failed to write registro_acceso(logout):", error.message);
    }
  }

  await supabase.auth.signOut();
  redirect("/login");
}

export interface RecoveryActionState {
  error?: string;
  success?: boolean;
}

/** Exported for reuse by other Server Actions that build absolute redirect
 * URLs from request headers (e.g. the admin invite flow, Phase 4). */
export async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/**
 * "Forgot password" email recovery (spec A3). Always returns success —
 * Supabase itself does not signal whether the email exists, and neither
 * do we (matches copy: "Si el correo existe, te enviamos un enlace.").
 */
export async function requestPasswordRecoveryAction(
  _prevState: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const parsed = recoverySchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? es.common.genericError,
    };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${origin}/auth/callback?next=/actualizar-clave` },
  );

  if (error) {
    console.error("resetPasswordForEmail failed:", error.message);
  }

  return { success: true };
}

export interface UpdatePasswordActionState {
  error?: string;
  success?: boolean;
}

/**
 * Sets a new password (spec A2/A3) for the session established via
 * /auth/callback (recovery or, later, invite links). Does not redirect
 * itself — the form shows a save toast (spec S6) and navigates home
 * client-side once `success` flips.
 */
export async function updatePasswordAction(
  _prevState: UpdatePasswordActionState,
  formData: FormData,
): Promise<UpdatePasswordActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? es.common.genericError,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: es.common.genericError };
  }

  return { success: true };
}
