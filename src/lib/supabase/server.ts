import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client (anon/publishable key) for Server Components,
 * Server Actions, and Route Handlers. RLS enforces access — this client
 * can never bypass it. Not server-only in the `server-only` package sense:
 * it never touches the service-role key, only the public anon key plus the
 * caller's own session cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render, where cookies cannot
            // be set. Harmless as long as middleware.ts also runs and
            // refreshes the session on the next request.
          }
        },
      },
    },
  );
}
