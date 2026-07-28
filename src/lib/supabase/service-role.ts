import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely.
 *
 * Server-only by construction, not just convention:
 * - `import "server-only"` fails the Next.js build if this module is ever
 *   reachable from a client bundle, even transitively (design decision
 *   "service_role key leakage", Engram sdd/platform-foundation/design).
 * - eslint.config.mjs additionally forbids importing this module (or
 *   @supabase/supabase-js directly) from src/components/**, the
 *   client/presentational layer, as an earlier editor-visible signal.
 *
 * Never call this from a "use client" file or with the anon/publishable
 * key. Use lib/supabase/server.ts for regular RLS-respecting server-side
 * access — this client exists only for privileged operations (e.g. the
 * admin invite flow, Phase 4) that RLS legitimately cannot express.
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. " +
        "The service-role client must never fall back to the anon key.",
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
