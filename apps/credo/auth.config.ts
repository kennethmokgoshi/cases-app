import type { NextAuthConfig } from "next-auth";

import {
  CREDO_IDLE_TIMEOUT_SECONDS,
  isCredoProtectedPathname,
} from "./lib/session-security";

// Edge-safe config — no Node.js imports (bcryptjs, prisma, etc.)
// Used by middleware.ts which runs on Edge Runtime.
// The full config (with Credentials provider) is in auth.ts.
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = isCredoProtectedPathname(nextUrl.pathname);
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.consumerId = user.id;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token.consumerId) {
        session.user.id = token.consumerId as string;
      }
      return session;
    },
  },
  providers: [], // Credentials provider added in auth.ts (Node.js only)
  session: {
    strategy: "jwt",
    maxAge: CREDO_IDLE_TIMEOUT_SECONDS,
    updateAge: 60,
  },
  jwt: {
    maxAge: CREDO_IDLE_TIMEOUT_SECONDS,
  },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: `credo.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};
