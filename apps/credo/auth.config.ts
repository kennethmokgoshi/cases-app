import type { NextAuthConfig } from "next-auth";

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
      const isDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (isDashboard && !isLoggedIn) return false;
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
  session: { strategy: "jwt" },
  trustHost: true,
};
