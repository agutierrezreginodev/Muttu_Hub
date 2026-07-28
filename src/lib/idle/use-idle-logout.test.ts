import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDLE_LOGOUT_STORAGE_KEY,
  useIdleLogout,
} from "@/lib/idle/use-idle-logout";

const signOutMock = vi.fn().mockResolvedValue({ error: null });
const assignMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: signOutMock } }),
}));

describe("useIdleLogout (spec A4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOutMock.mockClear();
    assignMock.mockClear();
    // jsdom's window.location.assign is non-configurable, so vi.spyOn on
    // the real property throws — replace the whole location object instead.
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("signs the user out and redirects once the idle timeout elapses", async () => {
    renderHook(() => useIdleLogout({ timeoutMs: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("resets the timer on user activity, delaying sign-out", async () => {
    renderHook(() => useIdleLogout({ timeoutMs: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    window.dispatchEvent(new Event("keydown"));
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(signOutMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on a cross-tab storage event (multi-tab sync)", async () => {
    renderHook(() => useIdleLogout({ timeoutMs: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: IDLE_LOGOUT_STORAGE_KEY,
        newValue: String(Date.now()),
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("ignores storage events for unrelated keys", async () => {
    renderHook(() => useIdleLogout({ timeoutMs: 1000 }));

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "some-other-key",
        newValue: "1",
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("calls the onIdle callback after signing out", async () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout({ timeoutMs: 1000, onIdle }));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
