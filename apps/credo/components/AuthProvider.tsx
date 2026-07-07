"use client";

import { SessionProvider } from "next-auth/react";

import { CredoSessionSecurity } from "./CredoSessionSecurity";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CredoSessionSecurity>{children}</CredoSessionSecurity>
    </SessionProvider>
  );
}
