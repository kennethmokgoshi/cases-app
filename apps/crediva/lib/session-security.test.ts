import { describe, expect, it } from "vitest";

import {
  CREDIVA_BROWSER_SESSION_KEY,
  CREDIVA_IDLE_TIMEOUT_MS,
  clearCredivaBrowserSession,
  getRemainingIdleMs,
  hasCredivaBrowserSession,
  isCredivaProtectedPathname,
  markCredivaBrowserSession,
  shouldExpireIdleSession,
  shouldRefreshServerSession,
} from "./session-security";

function createStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

describe("Crediva session security", () => {
  it("identifies confidential Crediva routes without blocking public token pages", () => {
    expect(isCredivaProtectedPathname("/dashboard")).toBe(true);
    expect(isCredivaProtectedPathname("/credit-report/history")).toBe(true);
    expect(isCredivaProtectedPathname("/documents/sign/doc-123")).toBe(true);
    expect(isCredivaProtectedPathname("/quote")).toBe(true);

    expect(isCredivaProtectedPathname("/")).toBe(false);
    expect(isCredivaProtectedPathname("/login")).toBe(false);
    expect(isCredivaProtectedPathname("/consent/token-123")).toBe(false);
    expect(isCredivaProtectedPathname("/quote/public-token")).toBe(false);
  });

  it("marks and clears the per-browser-session login flag", () => {
    const storage = createStorage();

    expect(hasCredivaBrowserSession(storage)).toBe(false);
    markCredivaBrowserSession(storage);
    expect(storage.getItem(CREDIVA_BROWSER_SESSION_KEY)).toBe("1");
    expect(hasCredivaBrowserSession(storage)).toBe(true);
    clearCredivaBrowserSession(storage);
    expect(hasCredivaBrowserSession(storage)).toBe(false);
  });

  it("expires idle sessions at five minutes and reports remaining time before then", () => {
    const lastActivityAt = 1_000;

    expect(shouldExpireIdleSession(lastActivityAt + CREDIVA_IDLE_TIMEOUT_MS - 1, lastActivityAt)).toBe(false);
    expect(getRemainingIdleMs(lastActivityAt + CREDIVA_IDLE_TIMEOUT_MS - 1, lastActivityAt)).toBe(1);
    expect(shouldExpireIdleSession(lastActivityAt + CREDIVA_IDLE_TIMEOUT_MS, lastActivityAt)).toBe(true);
    expect(getRemainingIdleMs(lastActivityAt + CREDIVA_IDLE_TIMEOUT_MS + 1, lastActivityAt)).toBe(0);
  });

  it("refreshes the server session at most once per refresh interval", () => {
    const lastRefreshAt = 10_000;

    expect(shouldRefreshServerSession(lastRefreshAt + 59_999, lastRefreshAt)).toBe(false);
    expect(shouldRefreshServerSession(lastRefreshAt + 60_000, lastRefreshAt)).toBe(true);
  });
});
