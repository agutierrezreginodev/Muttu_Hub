import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  fechaEnvioBogota,
  horizonFrom,
} from "../_shared/vencimiento.ts";
import { aggregate } from "./aggregate.ts";
import { fetchDueTareas, type DigestClient } from "./fetch.ts";
import { render } from "./render.ts";
import {
  resolveTransport,
  TransportConfigError,
  type DigestEmail,
  type Transport,
} from "./send.ts";
import { STRINGS } from "./strings.ts";

/**
 * Daily digest orchestration (slices 11a/11b, design §10 steps 1-7).
 *
 * The gates, the per-recipient scoping, the log-first idempotency write and
 * the no-content suppression are 11a; the real Resend/Mailpit transport it
 * hands off to is 11b (`send.ts`). The `send` parameter stays injectable so a
 * test can drive the whole loop without a network, but it is no longer a stub:
 * with nothing passed, a real transport is resolved from the environment.
 */

interface Recipient {
  usuario_id: string;
  email: string;
}

export type SendFn = (email: DigestEmail) => Promise<void>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleDigest(
  request: Request,
  env: Record<string, string | undefined>,
  send?: SendFn,
  now: Date = new Date(),
): Promise<Response> {
  // 1. Method gate. A digest run is a mutation; GET must not trigger one.
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // 2. Caller must present the service-role key. This function is scheduled by
  //    pg_cron (slice 12), never by a browser, so there is no user session to
  //    authenticate against — the shared secret IS the authorisation.
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // 3. Config gate. Missing config aborts the whole run rather than sending
  //    emails with broken links or an unroutable From.
  const baseUrl = env.APP_BASE_URL;
  const fromEmail = env.DIGEST_FROM_EMAIL;
  const supabaseUrl = env.SUPABASE_URL;
  if (!baseUrl || !fromEmail || !supabaseUrl) {
    return jsonResponse({ error: "missing_configuration" }, 500);
  }

  // 3b. Resolve the transport BEFORE touching a single recipient. A missing
  //     RESEND_API_KEY discovered mid-loop would mean some users got today's
  //     digest and the rest silently did not, with `digest_envio` rows already
  //     claimed for them — so tomorrow would skip them too.
  let transport: Transport | null = null;
  if (!send) {
    try {
      transport = resolveTransport(env);
    } catch (error) {
      if (error instanceof TransportConfigError) {
        return jsonResponse({ error: "missing_configuration" }, 500);
      }
      throw error;
    }
  }
  const sendEmail: SendFn = send ?? ((email) => transport!.send(email));

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const fechaEnvio = fechaEnvioBogota(now);
  const horizon = horizonFrom(now);

  // 4. Opted-in recipients. Absence of a preference row means opted IN (DG3),
  //    so this reads the opted-OUT set and excludes it rather than joining.
  const { data: optedOut, error: optedOutError } = await supabase
    .from("notificacion_preferencia")
    .select("usuario_id")
    .eq("resumen_diario_email", false);

  // A failed opt-out read must NEVER degrade to "nobody opted out" — that
  // would mail the people who explicitly asked not to be mailed.
  if (optedOutError) {
    return jsonResponse({ error: "preferences_unreadable" }, 500);
  }

  const excluded = new Set(
    (optedOut ?? []).map((row: { usuario_id: string }) => row.usuario_id),
  );

  const { data: usuarios, error: usuariosError } = await supabase
    .from("v_usuario_activo")
    .select("id, email");

  // And a failed recipient read must never degrade to "no recipients". That
  // exact silence is how this function once reported 200 {"enviados":0} every
  // day while both of its reads were being refused for want of a grant.
  if (usuariosError) {
    return jsonResponse({ error: "recipients_unreadable" }, 500);
  }

  const recipients: Recipient[] = (usuarios ?? [])
    .map((row: { id: string; email: string }) => ({
      usuario_id: row.id,
      email: row.email,
    }))
    .filter((recipient: Recipient) => !excluded.has(recipient.usuario_id));

  let enviados = 0;
  let sinContenido = 0;
  let yaEnviados = 0;

  // 5-7. Sequential per recipient. Not parallel: the loop writes an
  //      idempotency row per user and a burst would also hammer the mail
  //      provider's rate limit for no real gain at this scale.
  for (const recipient of recipients) {
    const rows = await fetchDueTareas(
      supabase as unknown as DigestClient,
      recipient.usuario_id,
      horizon,
    );
    const items = aggregate(rows, now);

    // No-content suppression: an empty digest is noise, and `digest_envio`'s
    // `item_count > 0` CHECK says so structurally.
    if (items.length === 0) {
      sinContenido += 1;
      continue;
    }

    // LOG FIRST, then send. The insert is the idempotency claim: if two runs
    // overlap, the second one's `on conflict do nothing` matches zero rows and
    // it skips. Sending first and logging after would risk a duplicate email
    // on a crash between the two — and a duplicate email is worse than a
    // missed one, because a missed one is retried tomorrow.
    const { data: claimed } = await supabase
      .from("digest_envio")
      .upsert(
        {
          usuario_id: recipient.usuario_id,
          fecha_envio: fechaEnvio,
          item_count: items.length,
        },
        { onConflict: "usuario_id,fecha_envio", ignoreDuplicates: true },
      )
      .select("id");

    if ((claimed ?? []).length === 0) {
      yaEnviados += 1;
      continue;
    }

    const email = render(items, { baseUrl, strings: STRINGS });
    await sendEmail({ to: recipient.email, ...email });
    enviados += 1;
  }

  // Counts only. Never emails, never titles: this response lands in function
  // logs, and logs are read by more people than the mailbox is.
  return jsonResponse(
    { fecha_envio: fechaEnvio, enviados, sin_contenido: sinContenido, ya_enviados: yaEnviados },
    200,
  );
}

Deno.serve((request) => handleDigest(request, Deno.env.toObject()));
