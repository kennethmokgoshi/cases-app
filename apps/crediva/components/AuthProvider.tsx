"use client";

import { SessionProvider } from "next-auth/react";

import { CredivaSessionSecurity } from "./CredivaSessionSecurity";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CredivaSessionSecurity>{children}</CredivaSessionSecurity>
    </SessionProvider>
  );
}
