import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CredoSessionSecurity } from "./CredoSessionSecurity";

let mockedPathname = "/";
let mockedStatus: "authenticated" | "loading" | "unauthenticated" = "unauthenticated";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
}));

vi.mock("next-auth/react", () => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  useSession: () => ({ status: mockedStatus }),
}));

describe("CredoSessionSecurity", () => {
  beforeEach(() => {
    mockedPathname = "/";
    mockedStatus = "unauthenticated";
  });

  it("renders public pages immediately", () => {
    mockedPathname = "/login";

    const html = renderToStaticMarkup(
      <CredoSessionSecurity>
        <main>Public login</main>
      </CredoSessionSecurity>,
    );

    expect(html).toContain("Public login");
  });

  it("withholds protected page content until the browser session is verified", () => {
    mockedPathname = "/credit-report";
    mockedStatus = "authenticated";

    const html = renderToStaticMarkup(
      <CredoSessionSecurity>
        <main>Confidential report</main>
      </CredoSessionSecurity>,
    );

    expect(html).toContain("Checking secure session");
    expect(html).not.toContain("Confidential report");
  });
});
