import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable without an active session (spec A5). Every other path,
 * including the app shell and its home placeholder, requires a session.
 *
 * These are URL paths, NOT folder paths. `/login` and `/recuperar` live under
 * `src/app/(auth)/`, and a parenthesised segment is a ROUTE GROUP: it never
 * appears in the URL. `/auth/callback` is the one entry that really does carry
 * an `/auth` prefix, because it sits at `src/app/auth/callback/` — outside the
 * group. Mixing the two conventions is what broke this list: it used to read
 * `/auth/recuperar`, a URL that does not exist, which left the real
 * `/recuperar` gated and bounced every unauthenticated visitor to /login —
 * making password recovery unreachable for exactly the users who need it.
 *
 * `/actualizar-clave` is deliberately NOT here: you only ever arrive there
 * holding a session that `/auth/callback` just established from an invite or
 * recovery link, so gating it is correct.
 */
const PUBLIC_PATHS = ["/login", "/recuperar", "/auth/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated visitors to /login for any non-public path (spec A5).
 *
 * This is a UX/routing convenience, not the security boundary: Postgres
 * RLS is (design decision "Security boundary"). Data access stays
 * RLS-gated even if a request somehow reaches a page without a session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run other code between createServerClient and getUser(): a
  // dropped getUser() call is a common cause of silent session-refresh
  // bugs with @supabase/ssr.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
