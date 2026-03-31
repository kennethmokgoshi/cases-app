import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Use the edge-safe authConfig (no bcryptjs/prisma) for middleware
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*"],
};
