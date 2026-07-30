import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "documentos";

/**
 * Signed-URL TTL in seconds. Short on purpose: the URL is a bearer capability
 * that bypasses RLS once minted, so it should outlive only the redirect and the
 * download that immediately follows it.
 */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Download one document version (task 6.3, spec document-library
 * "Single-document download"). Resolves the requested version's
 * `storage_path`, mints a short-lived signed URL and 302s to it.
 *
 * `?version=N` selects a specific historic version; without it the CURRENT
 * version is served (highest `version`). The parameter is never silently
 * ignored — spec document-versioning requires that asking for version 1 serve
 * the version-1 object rather than redirecting to the current one, so a
 * malformed value is a 400 rather than a quiet fallback.
 *
 * There is NO permission pre-check here, deliberately. Visibility comes
 * entirely from `documento_version`'s SELECT policy through the caller's own
 * RLS-gated client: a caller missing any axis (cliente, `documentos.ver`,
 * category grant) reads no row and gets a 404 having minted nothing. Signing
 * is likewise gated by PR3's `storage.objects` SELECT policy, which delegates
 * to `documento_version` via EXISTS — so a signing failure is also treated as
 * "not visible" (404) rather than a server error, and the response never
 * distinguishes "does not exist" from "not allowed to see it".
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentoId: string }> },
) {
  const { documentoId: documentoIdRaw } = await params;
  const documentoId = Number(documentoIdRaw);
  if (!Number.isInteger(documentoId) || documentoId <= 0) {
    return Response.json({ error: es.common.genericError }, { status: 400 });
  }

  const requestedVersion = new URL(request.url).searchParams.get("version");
  let version: number | null = null;
  if (requestedVersion !== null) {
    version = Number(requestedVersion);
    if (!Number.isInteger(version) || version <= 0) {
      return Response.json({ error: es.common.genericError }, { status: 400 });
    }
  }

  const supabase = await createClient();
  let query = supabase
    .from("documento_version")
    .select("storage_path")
    .eq("documento_id", documentoId);

  if (version !== null) {
    query = query.eq("version", version);
  }

  const { data } = await query.order("version", { ascending: false }).limit(1);
  const storagePath = data?.[0]?.storage_path;
  if (!storagePath) {
    return Response.json(
      { error: es.documentos.downloadError },
      { status: 404 },
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return Response.json(
      { error: es.documentos.downloadError },
      { status: 404 },
    );
  }

  return Response.redirect(signed.signedUrl, 302);
}
