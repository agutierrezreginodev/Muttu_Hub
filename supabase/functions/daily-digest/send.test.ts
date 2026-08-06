import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  TransportConfigError,
  resolveTransport,
  resolveTransportName,
} from "./send.ts";

const RESEND_ENV = {
  DIGEST_TRANSPORT: "resend",
  RESEND_API_KEY: "re_test_key",
  DIGEST_FROM_EMAIL: "no-reply@example.test",
};

const MAILPIT_ENV = {
  DIGEST_TRANSPORT: "mailpit",
  DIGEST_FROM_EMAIL: "no-reply@example.test",
  MAILPIT_BASE_URL: "http://127.0.0.1:54324",
};

describe("resolveTransportName (slice 11b)", () => {
  it("honours an explicit choice", () => {
    expect(resolveTransportName({ DIGEST_TRANSPORT: "mailpit" })).toBe(
      "mailpit",
    );
    expect(resolveTransportName({ DIGEST_TRANSPORT: "resend" })).toBe("resend");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(resolveTransportName({ DIGEST_TRANSPORT: " MailPit " })).toBe(
      "mailpit",
    );
  });

  it("defaults to resend, NOT to the local catcher", () => {
    // The default is load-bearing. Falling back to mailpit would make a
    // production deploy that forgot the variable look perfectly healthy while
    // posting every digest to a mailbox nobody reads.
    expect(resolveTransportName({})).toBe("resend");
  });

  it("refuses an unrecognised value instead of guessing", () => {
    expect(() => resolveTransportName({ DIGEST_TRANSPORT: "sendgrid" })).toThrow(
      TransportConfigError,
    );
  });
});

describe("resolveTransport (slice 11b)", () => {
  it("builds the resend transport when configured", () => {
    expect(resolveTransport(RESEND_ENV).name).toBe("resend");
  });

  it("builds the mailpit transport when configured", () => {
    expect(resolveTransport(MAILPIT_ENV).name).toBe("mailpit");
  });

  it("fails loudly when resend is selected without its key", () => {
    expect(() =>
      resolveTransport({ DIGEST_TRANSPORT: "resend", DIGEST_FROM_EMAIL: "a@b.c" }),
    ).toThrow(TransportConfigError);
  });

  it("fails loudly without a From address, on either transport", () => {
    expect(() =>
      resolveTransport({ DIGEST_TRANSPORT: "mailpit" }),
    ).toThrow(TransportConfigError);
    expect(() =>
      resolveTransport({ DIGEST_TRANSPORT: "resend", RESEND_API_KEY: "k" }),
    ).toThrow(TransportConfigError);
  });
});

describe("transport requests (slice 11b)", () => {
  const email = {
    to: "persona@example.test",
    subject: "Asunto",
    html: "<p>Hola</p>",
    text: "Hola",
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to Resend with a bearer key and the configured From", async () => {
    await resolveTransport(RESEND_ENV).send(email);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "no-reply@example.test",
      to: ["persona@example.test"],
      subject: "Asunto",
    });
  });

  it("posts to Mailpit's send API in its own payload shape", async () => {
    await resolveTransport(MAILPIT_ENV).send(email);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:54324/api/v1/send");
    expect(JSON.parse(init.body as string)).toMatchObject({
      From: { Email: "no-reply@example.test" },
      To: [{ Email: "persona@example.test" }],
      Subject: "Asunto",
    });
  });

  it("does not double the slash when MAILPIT_BASE_URL has a trailing one", async () => {
    await resolveTransport({
      ...MAILPIT_ENV,
      MAILPIT_BASE_URL: "http://127.0.0.1:54324/",
    }).send(email);

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "http://127.0.0.1:54324/api/v1/send",
    );
  });

  it("raises on a rejected send, without echoing the recipient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 422 }))),
    );

    // The message reaches function logs, which more people read than the
    // mailbox — so it carries a status, never an address.
    await expect(resolveTransport(RESEND_ENV).send(email)).rejects.toThrow(
      /422/,
    );
    await expect(resolveTransport(RESEND_ENV).send(email)).rejects.not.toThrow(
      /persona@example\.test/,
    );
  });
});

/**
 * The secrets boundary, checked structurally.
 *
 * `RESEND_API_KEY` and the service-role key belong to the Edge Function's
 * environment and nowhere near the browser. This walks `src/` — everything
 * that can end up in a client bundle — and asserts neither name appears, and
 * that no `NEXT_PUBLIC_*` variable carries one. A reviewer cannot eyeball
 * this across a growing tree; a test can.
 */
describe("no digest secret can reach the client bundle", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("never names RESEND_API_KEY anywhere under src/", () => {
    const offenders = walk(path.resolve(process.cwd(), "src")).filter((file) =>
      readFileSync(file, "utf8").includes("RESEND_API_KEY"),
    );

    expect(offenders).toEqual([]);
  });

  it("never exposes the service-role key through a NEXT_PUBLIC_ name", () => {
    const offenders = walk(path.resolve(process.cwd(), "src")).filter((file) =>
      /NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|RESEND)/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps SUPABASE_SERVICE_ROLE_KEY out of every client component", () => {
    const offenders = walk(path.resolve(process.cwd(), "src")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
        /^\s*["']use client["']/m.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });
});
