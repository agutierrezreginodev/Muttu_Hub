import { MAILPIT_URL } from "../env";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MailpitMessageDetail {
  Text: string;
}

/**
 * Polls the local Supabase email-testing server (Mailpit/Inbucket, see
 * `supabase status`'s MAILPIT_URL) for the newest invite/recovery email
 * sent to `email` since `sinceIso`, then extracts the `/auth/v1/verify`
 * link from its plaintext body.
 *
 * Real email round-trip — no mocking: this is what actually proves the
 * invite flow works end to end (spec T3).
 */
export async function waitForVerifyLink(
  email: string,
  sinceIso: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const list = (await listRes.json()) as {
      messages: MailpitMessageSummary[];
    };

    const match = list.messages.find(
      (message) =>
        message.To.some((to) => to.Address === email) &&
        new Date(message.Created).getTime() >= new Date(sinceIso).getTime(),
    );

    if (match) {
      const detailRes = await fetch(
        `${MAILPIT_URL}/api/v1/message/${match.ID}`,
      );
      const detail = (await detailRes.json()) as MailpitMessageDetail;
      const linkMatch = detail.Text.match(/https?:\/\/\S+verify\?[^\s)]+/);
      if (linkMatch) {
        return linkMatch[0];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for a verify email to ${email}`,
  );
}

export interface ReceivedMessage {
  subject: string;
  text: string;
}

/**
 * Waits for any message addressed to `email` and returns its subject and
 * plaintext body (kanban slice 11b — the daily digest).
 *
 * Separate from `waitForVerifyLink` rather than a parameter on it: that one's
 * contract is "find the verify link or fail", and a digest has no verify link.
 * Folding both into one function would make its return type a lie for one of
 * the two callers.
 */
export async function waitForMessageTo(
  email: string,
  sinceIso: string,
  timeoutMs = 20_000,
): Promise<ReceivedMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const list = (await listRes.json()) as {
      messages: (MailpitMessageSummary & { Subject: string })[];
    };

    const match = list.messages.find(
      (message) =>
        message.To.some((to) => to.Address === email) &&
        new Date(message.Created).getTime() >= new Date(sinceIso).getTime(),
    );

    if (match) {
      const detailRes = await fetch(
        `${MAILPIT_URL}/api/v1/message/${match.ID}`,
      );
      const detail = (await detailRes.json()) as MailpitMessageDetail;
      return { subject: match.Subject, text: detail.Text };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for a message to ${email}`,
  );
}

/** How many messages Mailpit currently holds for `email`. */
export async function countMessagesTo(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
  const list = (await res.json()) as { messages: MailpitMessageSummary[] };
  return list.messages.filter((message) =>
    message.To.some((to) => to.Address === email),
  ).length;
}
