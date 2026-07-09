import { describe, expect, it } from "vitest";

import {
  CREDO_BROWSER_SESSION_KEY,
  CREDO_IDLE_TIMEOUT_MS,
  clearCredoBrowserSession,
  getRemainingIdleMs,
  hasCredoBrowserSession,
  isCredoProtectedPathname,
  markCredoBrowserSession,
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

describe("Credo session security", () => {
  it("identifies confidential Credo routes without blocking public token pages", () => {
    expect(isCredoProtectedPathname("/dashboard")).toBe(true);
    expect(isCredoProtectedPathname("/credit-report/history")).toBe(true);
    expect(isCredoProtectedPathname("/documents/sign/doc-123")).toBe(true);
    expect(isCredoProtectedPathname("/quote")).toBe(true);

    expect(isCredoProtectedPathname("/")).toBe(false);
    expect(isCredoProtectedPathname("/login")).toBe(false);
    expect(isCredoProtectedPathname("/consent/token-123")).toBe(false);
    expect(isCredoProtectedPathname("/quote/public-token")).toBe(false);
  });

  it("marks and clears the per-browser-session login flag", () => {
    const storage = createStorage();

    expect(hasCredoBrowserSession(storage)).toBe(false);
    markCredoBrowserSession(storage);
    expect(storage.getItem(CREDO_BROWSER_SESSION_KEY)).toBe("1");
    expect(hasCredoBrowserSession(storage)).toBe(true);
    clearCredoBrowserSession(storage);
    expect(hasCredoBrowserSession(storage)).toBe(false);
  });

  it("expires idle sessions at five minutes and reports remaining time before then", () => {
    const lastActivityAt = 1_000;

    expect(shouldExpireIdleSession(lastActivityAt + CREDO_IDLE_TIMEOUT_MS - 1, lastActivityAt)).toBe(false);
    expect(getRemainingIdleMs(lastActivityAt + CREDO_IDLE_TIMEOUT_MS - 1, lastActivityAt)).toBe(1);
    expect(shouldExpireIdleSession(lastActivityAt + CREDO_IDLE_TIMEOUT_MS, lastActivityAt)).toBe(true);
    expect(getRemainingIdleMs(lastActivityAt + CREDO_IDLE_TIMEOUT_MS + 1, lastActivityAt)).toBe(0);
  });

  it("refreshes the server session at most once per refresh interval", () => {
    const lastRefreshAt = 10_000;

    expect(shouldRefreshServerSession(lastRefreshAt + 59_999, lastRefreshAt)).toBe(false);
    expect(shouldRefreshServerSession(lastRefreshAt + 60_000, lastRefreshAt)).toBe(true);
  });
});
