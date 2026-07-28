import { z } from "zod";

import { es } from "@/messages/es";

/**
 * Password policy (spec A2): at least 8 characters, combining letters and
 * numbers. Enforced identically on password-set (recovery, invite,
 * Phase 4 admin reset) — never relaxed client-side vs. server-side, since
 * this schema is imported by both the Client Component form and the
 * Server Action that ultimately calls supabase.auth.updateUser().
 */
export const passwordSchema = z
  .string()
  .min(8, { message: es.auth.passwordTooWeak })
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: es.auth.passwordTooWeak,
  })
  .refine((value) => /[0-9]/.test(value), {
    message: es.auth.passwordTooWeak,
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: es.auth.emailRequired })
    .email({ message: es.auth.emailInvalid }),
  password: z.string().min(1, { message: es.auth.passwordRequired }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const recoverySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: es.auth.emailRequired })
    .email({ message: es.auth.emailInvalid }),
});

export type RecoveryInput = z.infer<typeof recoverySchema>;

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: es.auth.passwordMismatch,
    path: ["confirmPassword"],
  });

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
