import { describe, expect, it } from "vitest";

import { authConfig } from "./auth.config";
import { CREDIVA_IDLE_TIMEOUT_SECONDS } from "./lib/session-security";

const authorized = authConfig.callbacks?.authorized;

if (!authorized) {
  throw new Error("Expected Crediva authConfig to define an authorized callback");
}

function authorizePath(pathname: string, loggedIn: boolean): ReturnType<typeof authorized> {
  const requestUrl = new URL(`https://crediva.test${pathname}`);

  return authorized({
    auth: loggedIn ? { user: { id: "consumer-1" } } : null,
    request: { nextUrl: requestUrl },
  } as Parameters<typeof authorized>[0]);
}

describe("Crediva auth config", () => {
  it("uses a five-minute JWT session lifetime", () => {
    expect(authConfig.session?.maxAge).toBe(CREDIVA_IDLE_TIMEOUT_SECONDS);
    expect(authConfig.jwt?.maxAge).toBe(CREDIVA_IDLE_TIMEOUT_SECONDS);
  });

  it("blocks protected Crediva pages when no consumer is signed in", () => {
    expect(authorizePath("/dashboard", false)).toBe(false);
    expect(authorizePath("/my-account", false)).toBe(false);
    expect(authorizePath("/credit-report/history", false)).toBe(false);
  });

  it("allows public pages and signed-in access", () => {
    expect(authorizePath("/login", false)).toBe(true);
    expect(authorizePath("/consent/token-123", false)).toBe(true);
    expect(authorizePath("/quote/public-token", false)).toBe(true);
    expect(authorizePath("/credit-report", true)).toBe(true);
  });
});
