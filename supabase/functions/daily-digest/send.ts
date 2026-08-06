export interface DigestEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Transport {
  readonly name: TransportName;
  send(email: DigestEmail): Promise<void>;
}

export type TransportName = "resend" | "mailpit";

export type DigestEnv = Record<string, string | undefined>;

/**
 * Thrown when the selected transport's own configuration is missing. Surfaces
 * through `index.ts`'s config gate as a 500 before any recipient is touched,
 * rather than as a per-recipient failure halfway through a run.
 */
export class TransportConfigError extends Error {}

/**
 * Which transport this environment asks for (slice 11b).
 *
 * An explicit `DIGEST_TRANSPORT` always wins. With nothing set the answer is
 * `resend`, NOT mailpit — and the default matters. Defaulting to the local
 * catcher would make a production deploy that forgot the variable look
 * perfectly healthy while quietly posting every digest to a mailbox nobody
 * reads. Failing to reach Resend is loud; succeeding at reaching nowhere is
 * not.
 */
export function resolveTransportName(env: DigestEnv): TransportName {
  const requested = env.DIGEST_TRANSPORT?.trim().toLowerCase();

  if (requested === "mailpit") {
    return "mailpit";
  }

  if (requested && requested !== "resend") {
    throw new TransportConfigError(
      `DIGEST_TRANSPORT must be "resend" or "mailpit", got "${requested}"`,
    );
  }

  return "resend";
}

/**
 * Production transport. Plain `fetch` against Resend's REST API — no Deno
 * dependency, nothing added to package.json.
 */
function resendTransport(env: DigestEnv): Transport {
  const apiKey = env.RESEND_API_KEY;
  const from = env.DIGEST_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new TransportConfigError(
      "resend transport needs RESEND_API_KEY and DIGEST_FROM_EMAIL",
    );
  }

  return {
    name: "resend",
    async send(email: DigestEmail): Promise<void> {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });

      if (!response.ok) {
        // Status only. The body can echo the recipient address, and this
        // message lands in function logs.
        throw new Error(`resend rejected the message (${response.status})`);
      }
    },
  };
}

/**
 * Local and E2E transport. `POST /api/v1/send` on the Mailpit that
 * `supabase start` already bundles — verified against the running instance
 * rather than assumed from the docs, so no SMTP client and no extra
 * dependency are needed.
 */
function mailpitTransport(env: DigestEnv): Transport {
  const baseUrl = env.MAILPIT_BASE_URL ?? "http://127.0.0.1:54324";
  const from = env.DIGEST_FROM_EMAIL;

  if (!from) {
    throw new TransportConfigError("mailpit transport needs DIGEST_FROM_EMAIL");
  }

  return {
    name: "mailpit",
    async send(email: DigestEmail): Promise<void> {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/api/v1/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            From: { Email: from },
            To: [{ Email: email.to }],
            Subject: email.subject,
            HTML: email.html,
            Text: email.text,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`mailpit rejected the message (${response.status})`);
      }
    },
  };
}

export function resolveTransport(env: DigestEnv): Transport {
  return resolveTransportName(env) === "mailpit"
    ? mailpitTransport(env)
    : resendTransport(env);
}
