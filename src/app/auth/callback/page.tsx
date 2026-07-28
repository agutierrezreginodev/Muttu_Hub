"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Completes an invite or password-recovery link (spec A3/U8).
 *
 * Why a CLIENT page reading `window.location.hash` manually, instead of a
 * Route Handler or `detectSessionInUrl`'s automatic URL detection: GoTrue's
 * invite/recovery emails deliver session tokens in the URL FRAGMENT
 * (`#access_token=...&refresh_token=...`), because `inviteUserByEmail` and
 * `resetPasswordForEmail` are admin/server-initiated — there is no PKCE
 * code_verifier cookie to exchange, so GoTrue never sends a `?code=` query
 * param here, only the fragment.
 *
 * Two things had to be ruled out empirically (both real, not hypothetical
 * — found while building Playwright coverage for task 5.1):
 * 1. A Route Handler can never see this: browsers strip URL fragments
 *    before sending the HTTP request. A prior version of this route tried
 *    `exchangeCodeForSession(code)` here and silently failed for every
 *    invite/recovery link — `code` never arrives on this path.
 * 2. `@supabase/ssr`'s `createBrowserClient` hard-codes `flowType: "pkce"`
 *    (see its source), and `_getSessionFromURL` EXPLICITLY REJECTS an
 *    implicit-style (hash-token) callback when the client is configured
 *    for PKCE (`AuthPKCEGrantCodeExchangeError`). So `detectSessionInUrl`'s
 *    automatic detection — and therefore a plain `getSession()` call here —
 *    can never pick up these tokens either, even though the hash is
 *    genuinely present at mount (confirmed via direct instrumentation).
 *
 * The fix that actually works: parse `access_token`/`refresh_token` out of
 * the hash ourselves and hand them to `setSession()`, which has no
 * flowType gate at all — it just validates and stores whatever token pair
 * you give it. That establishes the session in the shared cookie storage
 * adapter, so the server/middleware sees it on the very next request.
 *
 * One of the three paths middleware treats as public (spec A5).
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = searchParams.get("next") ?? "/";
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const supabase = createClient();

    (async () => {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          router.replace(next);
          return;
        }
      }
      router.replace("/login");
    })();
  }, [router, searchParams]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{es.auth.confirmingSession}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={null}>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
