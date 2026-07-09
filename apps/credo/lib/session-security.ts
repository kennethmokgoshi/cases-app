export const CREDO_IDLE_TIMEOUT_SECONDS = 5 * 60;
export const CREDO_IDLE_TIMEOUT_MS = CREDO_IDLE_TIMEOUT_SECONDS * 1000;
export const CREDO_SESSION_REFRESH_INTERVAL_MS = 60 * 1000;
export const CREDO_BROWSER_SESSION_KEY = "credo.browser-session-active";

export const CREDO_ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
  "focus",
  "visibilitychange",
] as const;

const PREFIX_PROTECTED_PATHS = [
  "/dashboard",
  "/my-account",
  "/credit-report",
  "/cases",
  "/documents",
  "/settings",
  "/admin",
  "/upgrade",
  "/change-password",
] as const;

const EXACT_PROTECTED_PATHS = ["/quote"] as const;

type BrowserSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isCredoProtectedPathname(pathname: string): boolean {
  return (
    EXACT_PROTECTED_PATHS.some((path) => pathname === path) ||
    PREFIX_PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

export function hasCredoBrowserSession(storage: Pick<BrowserSessionStorage, "getItem">): boolean {
  return storage.getItem(CREDO_BROWSER_SESSION_KEY) === "1";
}

export function markCredoBrowserSession(storage: Pick<BrowserSessionStorage, "setItem">): void {
  storage.setItem(CREDO_BROWSER_SESSION_KEY, "1");
}

export function clearCredoBrowserSession(storage: Pick<BrowserSessionStorage, "removeItem">): void {
  storage.removeItem(CREDO_BROWSER_SESSION_KEY);
}

export function shouldExpireIdleSession(
  now: number,
  lastActivityAt: number,
  timeoutMs = CREDO_IDLE_TIMEOUT_MS,
): boolean {
  return now - lastActivityAt >= timeoutMs;
}

export function getRemainingIdleMs(
  now: number,
  lastActivityAt: number,
  timeoutMs = CREDO_IDLE_TIMEOUT_MS,
): number {
  return Math.max(timeoutMs - (now - lastActivityAt), 0);
}

export function shouldRefreshServerSession(
  now: number,
  lastRefreshAt: number,
  intervalMs = CREDO_SESSION_REFRESH_INTERVAL_MS,
): boolean {
  return now - lastRefreshAt >= intervalMs;
}
