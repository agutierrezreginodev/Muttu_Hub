"use client";

import { useCallback, useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import { IDLE_TIMEOUT_MS } from "@/config/idle";

/** localStorage key used to broadcast activity across tabs. */
export const IDLE_LOGOUT_STORAGE_KEY = "muttu-hub:idle-last-activity";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

export interface UseIdleLogoutOptions {
  /** Override the configured timeout (ms). Defaults to IDLE_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Called after signOut() resolves, before the redirect to /login. */
  onIdle?: () => void;
}

/**
 * Client-side idle auto-logout (spec A4). Any of ACTIVITY_EVENTS resets
 * the timer and, via localStorage, resets it in every other open tab too
 * (a user active in one tab should not be logged out in another). When
 * the timer elapses with no activity anywhere, signs out and redirects to
 * /login.
 */
export function useIdleLogout(options: UseIdleLogoutOptions = {}): void {
  const timeoutMs = options.timeoutMs ?? IDLE_TIMEOUT_MS;
  const onIdle = options.onIdle;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleIdle = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    onIdle?.();
    window.location.assign("/login");
  }, [onIdle]);

  const resetTimer = useCallback(
    (broadcast: boolean) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void handleIdle();
      }, timeoutMs);

      if (broadcast) {
        try {
          window.localStorage.setItem(
            IDLE_LOGOUT_STORAGE_KEY,
            String(Date.now()),
          );
        } catch {
          // localStorage unavailable (private browsing, quota, etc.) —
          // falls back to single-tab-only idle tracking.
        }
      }
    },
    [timeoutMs, handleIdle],
  );

  useEffect(() => {
    resetTimer(false);

    const handleActivity = () => resetTimer(true);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === IDLE_LOGOUT_STORAGE_KEY) {
        resetTimer(false);
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity),
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) =>
        window.removeEventListener(eventName, handleActivity),
      );
      window.removeEventListener("storage", handleStorage);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [resetTimer]);
}
