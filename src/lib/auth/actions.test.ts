import { describe, expect, it, vi, beforeEach } from "vitest";

import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import {
  loginAction,
  logoutAction,
  getOrigin,
  requestPasswordRecoveryAction,
  updatePasswordAction,
} from "@/lib/auth/actions";

const { redirectMock, headersMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    // Mirrors next/navigation's real redirect(): it throws, execution never
    // continues past the call site.
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  headersMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

/**
 * Builds a fake Supabase client for the auth actions. `callLog` lets tests
 * assert ORDERING between the registro_acceso insert and other calls
 * (logoutAction writes the log row BEFORE invalidating the session — the
 * insert needs auth.uid() to still resolve, per its own-row-only RLS
 * policy).
 */
function createAuthClient(options: {
  callLog?: string[];
  signInError?: unknown;
  signInUser?: { id: string } | null;
  insertError?: unknown;
  getUserResult?: { id: string } | null;
  resetPasswordError?: unknown;
  updateUserError?: unknown;
}) {
  const callLog = options.callLog ?? [];

  const insert = vi.fn(() => {
    callLog.push("insert");
    return Promise.resolve({ error: options.insertError ?? null });
  });
  const from = vi.fn(() => ({ insert }));

  const signInWithPassword = vi.fn(() => {
    callLog.push("signInWithPassword");
    return Promise.resolve({
      data: { user: options.signInUser ?? null },
      error: options.signInError ?? null,
    });
  });

  const getUser = vi.fn(() =>
    Promise.resolve({ data: { user: options.getUserResult ?? null } }),
  );

  const signOut = vi.fn(() => {
    callLog.push("signOut");
    return Promise.resolve({ error: null });
  });

  const resetPasswordForEmail = vi.fn(() =>
    Promise.resolve({ error: options.resetPasswordError ?? null }),
  );

  const updateUser = vi.fn(() =>
    Promise.resolve({ error: options.updateUserError ?? null }),
  );

  return {
    from,
    insert,
    auth: {
      signInWithPassword,
      getUser,
      signOut,
      resetPasswordForEmail,
      updateUser,
    },
    callLog,
  };
}

function mockHeaders(values: Record<string, string | undefined>) {
  headersMock.mockResolvedValue({
    get: (key: string) => values[key] ?? null,
  });
}

beforeEach(() => {
  mockedCreateClient.mockReset();
  redirectMock.mockClear();
  headersMock.mockReset();
  mockHeaders({ host: "app.muttuhub.com" });
});

describe("loginAction (spec A1/A5/S2)", () => {
  it("rejects an empty email before ever reaching Supabase", async () => {
    const result = await loginAction(
      {},
      formData({ email: "", password: "secret123" }),
    );

    expect(result.error).toBeTruthy();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns the SAME generic error for a wrong password as for a nonexistent account (spec S2 — never leak which)", async () => {
    const wrongPasswordClient = createAuthClient({
      signInError: { message: "Invalid login credentials" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(wrongPasswordClient as any);

    const wrongPasswordResult = await loginAction(
      {},
      formData({ email: "real@muttuhub.com", password: "wrongpass1" }),
    );

    const nonexistentClient = createAuthClient({
      signInError: { message: "Invalid login credentials" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(nonexistentClient as any);

    const nonexistentResult = await loginAction(
      {},
      formData({ email: "ghost@muttuhub.com", password: "whatever1" }),
    );

    expect(wrongPasswordResult.error).toBe(es.auth.invalidCredentials);
    expect(nonexistentResult.error).toBe(es.auth.invalidCredentials);
    expect(wrongPasswordResult.error).toBe(nonexistentResult.error);
  });

  it("never writes a registro_acceso row on a failed login", async () => {
    const client = createAuthClient({
      signInError: { message: "Invalid login credentials" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await loginAction(
      {},
      formData({ email: "ghost@muttuhub.com", password: "whatever1" }),
    );

    expect(client.from).not.toHaveBeenCalled();
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("also masks the case where signInWithPassword reports no error but no user either", async () => {
    const client = createAuthClient({ signInError: null, signInUser: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await loginAction(
      {},
      formData({ email: "ghost@muttuhub.com", password: "whatever1" }),
    );

    expect(result.error).toBe(es.auth.invalidCredentials);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it("writes registro_acceso('login') with the fresh user id and redirects home on success", async () => {
    const client = createAuthClient({ signInUser: { id: "user-1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      loginAction(
        {},
        formData({ email: "real@muttuhub.com", password: "correct12" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(client.from).toHaveBeenCalledWith("registro_acceso");
    expect(client.insert).toHaveBeenCalledWith({
      usuario_id: "user-1",
      evento: "login",
    });
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("still redirects home even when the registro_acceso insert itself fails (best-effort log, not fatal)", async () => {
    const client = createAuthClient({
      signInUser: { id: "user-1" },
      insertError: { message: "insert denied" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      loginAction(
        {},
        formData({ email: "real@muttuhub.com", password: "correct12" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(client.insert).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});

describe("logoutAction", () => {
  it("writes registro_acceso('logout') BEFORE invalidating the session", async () => {
    const callLog: string[] = [];
    const client = createAuthClient({
      callLog,
      getUserResult: { id: "user-1" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(client.insert).toHaveBeenCalledWith({
      usuario_id: "user-1",
      evento: "logout",
    });
    expect(client.auth.signOut).toHaveBeenCalled();
    expect(callLog).toEqual(["insert", "signOut"]);
  });

  it("redirects to /login", async () => {
    const client = createAuthClient({ getUserResult: { id: "user-1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(logoutAction()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("skips the insert but still signs out and redirects when there is no active user", async () => {
    const client = createAuthClient({ getUserResult: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(client.insert).not.toHaveBeenCalled();
    expect(client.auth.signOut).toHaveBeenCalled();
  });

  it("still signs out and redirects even when the registro_acceso insert fails", async () => {
    const client = createAuthClient({
      getUserResult: { id: "user-1" },
      insertError: { message: "insert denied" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(client.auth.signOut).toHaveBeenCalled();
  });
});

describe("getOrigin", () => {
  it("prefers x-forwarded-host / x-forwarded-proto when present", async () => {
    mockHeaders({
      "x-forwarded-host": "muttuhub.com",
      "x-forwarded-proto": "https",
      host: "internal-host:3000",
    });

    const origin = await getOrigin();

    expect(origin).toBe("https://muttuhub.com");
  });

  it("falls back to host + http when forwarded headers are absent", async () => {
    mockHeaders({ host: "localhost:3000" });

    const origin = await getOrigin();

    expect(origin).toBe("http://localhost:3000");
  });
});

describe("requestPasswordRecoveryAction (spec A3 — no account-existence leak)", () => {
  it("rejects an invalid email before ever reaching Supabase", async () => {
    const result = await requestPasswordRecoveryAction(
      {},
      formData({ email: "not-an-email" }),
    );

    expect(result.error).toBeTruthy();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("calls resetPasswordForEmail with the exact origin-based redirectTo", async () => {
    mockHeaders({
      "x-forwarded-host": "muttuhub.com",
      "x-forwarded-proto": "https",
    });
    const client = createAuthClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    await requestPasswordRecoveryAction(
      {},
      formData({ email: "real@muttuhub.com" }),
    );

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "real@muttuhub.com",
      {
        redirectTo: "https://muttuhub.com/auth/callback?next=/actualizar-clave",
      },
    );
  });

  it("returns the SAME success response for a known account as for an unknown one", async () => {
    const knownClient = createAuthClient({ resetPasswordError: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(knownClient as any);

    const knownResult = await requestPasswordRecoveryAction(
      {},
      formData({ email: "real@muttuhub.com" }),
    );

    const unknownClient = createAuthClient({
      resetPasswordError: { message: "User not found" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValueOnce(unknownClient as any);

    const unknownResult = await requestPasswordRecoveryAction(
      {},
      formData({ email: "ghost@muttuhub.com" }),
    );

    expect(knownResult).toEqual({ success: true });
    expect(unknownResult).toEqual({ success: true });
    expect(knownResult).toEqual(unknownResult);
  });
});

describe("updatePasswordAction (spec A2/A3)", () => {
  it("rejects a password that fails the weak-password policy before reaching Supabase", async () => {
    const result = await updatePasswordAction(
      {},
      formData({ password: "short", confirmPassword: "short" }),
    );

    expect(result.error).toBe(es.auth.passwordTooWeak);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects mismatched password/confirmPassword before reaching Supabase", async () => {
    const result = await updatePasswordAction(
      {},
      formData({ password: "correct123", confirmPassword: "different123" }),
    );

    expect(result.error).toBe(es.auth.passwordMismatch);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("calls updateUser with the new password and returns success", async () => {
    const client = createAuthClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updatePasswordAction(
      {},
      formData({ password: "correct123", confirmPassword: "correct123" }),
    );

    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "correct123",
    });
    expect(result).toEqual({ success: true });
  });

  it("returns a generic error (not the raw Supabase failure) when updateUser fails", async () => {
    const client = createAuthClient({
      updateUserError: { message: "session expired, cannot update" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(client as any);

    const result = await updatePasswordAction(
      {},
      formData({ password: "correct123", confirmPassword: "correct123" }),
    );

    expect(result.error).toBe(es.common.genericError);
    expect(result.error).not.toContain("session expired");
  });
});
