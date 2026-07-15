import type { NextAuthConfig } from "next-auth";

import {
  CREDIVA_IDLE_TIMEOUT_SECONDS,
  isCredivaProtectedPathname,
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
      const isProtected = isCredivaProtectedPathname(nextUrl.pathname);
      if (isProtected && !isLoggedIn) return false;
      // Default/temporary passwords must be changed before anything else is
      // reachable — pin the session to the change-password screen.
      if (
        isLoggedIn &&
        auth?.user?.mustChangePassword &&
        isProtected &&
        nextUrl.pathname !== "/change-password"
      ) {
        return Response.redirect(new URL("/change-password", nextUrl));
      }
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.consumerId = user.id;
        token.name = user.name;
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      // Allow the client to clear the flag after a successful password change
      // (via useSession().update({ mustChangePassword: false })).
      if (trigger === "update" && typeof session?.mustChangePassword === "boolean") {
        token.mustChangePassword = session.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (token.consumerId) {
        session.user.id = token.consumerId as string;
      }
      session.user.mustChangePassword = (token.mustChangePassword as boolean) ?? false;
      return session;
    },
  },
  providers: [], // Credentials provider added in auth.ts (Node.js only)
  session: {
    strategy: "jwt",
    maxAge: CREDIVA_IDLE_TIMEOUT_SECONDS,
    updateAge: 60,
  },
  jwt: {
    maxAge: CREDIVA_IDLE_TIMEOUT_SECONDS,
  },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: `crediva.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};
