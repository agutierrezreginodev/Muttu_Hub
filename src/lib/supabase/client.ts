import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon/publishable key). RLS enforces access —
 * this client can never bypass it. Call only from Client Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
