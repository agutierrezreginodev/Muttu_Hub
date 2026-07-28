/**
 * Idle session timeout (PRD A4): minutes of user inactivity before the
 * client signs out. Configurable via NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES,
 * default 480 (8 hours). Isomorphic module — safe on client and server.
 */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 480;

function parseIdleTimeoutMinutes(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_IDLE_TIMEOUT_MINUTES;
}

export const IDLE_TIMEOUT_MINUTES = parseIdleTimeoutMinutes(
  process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES,
);

export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
