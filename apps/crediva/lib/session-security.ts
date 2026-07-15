export const CREDIVA_IDLE_TIMEOUT_SECONDS = 5 * 60;
export const CREDIVA_IDLE_TIMEOUT_MS = CREDIVA_IDLE_TIMEOUT_SECONDS * 1000;
export const CREDIVA_SESSION_REFRESH_INTERVAL_MS = 60 * 1000;
export const CREDIVA_BROWSER_SESSION_KEY = "crediva.browser-session-active";

export const CREDIVA_ACTIVITY_EVENTS = [
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

export function isCredivaProtectedPathname(pathname: string): boolean {
  return (
    EXACT_PROTECTED_PATHS.some((path) => pathname === path) ||
    PREFIX_PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

export function hasCredivaBrowserSession(storage: Pick<BrowserSessionStorage, "getItem">): boolean {
  return storage.getItem(CREDIVA_BROWSER_SESSION_KEY) === "1";
}

export function markCredivaBrowserSession(storage: Pick<BrowserSessionStorage, "setItem">): void {
  storage.setItem(CREDIVA_BROWSER_SESSION_KEY, "1");
}

export function clearCredivaBrowserSession(storage: Pick<BrowserSessionStorage, "removeItem">): void {
  storage.removeItem(CREDIVA_BROWSER_SESSION_KEY);
}

export function shouldExpireIdleSession(
  now: number,
  lastActivityAt: number,
  timeoutMs = CREDIVA_IDLE_TIMEOUT_MS,
): boolean {
  return now - lastActivityAt >= timeoutMs;
}

export function getRemainingIdleMs(
  now: number,
  lastActivityAt: number,
  timeoutMs = CREDIVA_IDLE_TIMEOUT_MS,
): number {
  return Math.max(timeoutMs - (now - lastActivityAt), 0);
}

export function shouldRefreshServerSession(
  now: number,
  lastRefreshAt: number,
  intervalMs = CREDIVA_SESSION_REFRESH_INTERVAL_MS,
): boolean {
  return now - lastRefreshAt >= intervalMs;
}
