import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import {
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@zenowethu/shared-lib";
import { z } from "zod";
import { authConfig } from "./auth.config";

// The 13-digit SA ID number is the ONLY username. Email and cell number are not
// unique (two consumers may legitimately share them), so they cannot identify a
// single account and are never accepted as login identifiers.
const credentialsSchema = z.object({
  username: z.string().regex(/^\d{13}$/, "Enter your 13-digit ID number"),
  password: z.string().min(1, "Password is required"),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "ID number", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const idNumber = parsed.data.username.trim();

        const consumer = await prisma.consumerAccount.findUnique({
          where: { idNumber },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            password: true,
            role: true,
            isAdmin: true,
            tenantId: true,
            idNumber: true,
            mustChangePassword: true,
            lockedUntil: true,
          },
        });

        if (!consumer) return null;

        // Older auto-provisioned profiles may still have no password (pre
        // default-password rollout) — they activate via the emailed reset link.
        if (!consumer.password) return null;

        // Brute-force lockout: reject even a correct password inside the window.
        if (isAccountLocked(consumer)) return null;

        const valid = await bcrypt.compare(parsed.data.password, consumer.password);
        if (!valid) {
          await recordFailedLogin(consumer.id);
          return null;
        }

        await recordSuccessfulLogin(consumer.id);

        return {
          id: consumer.id,
          email: consumer.email,
          name: `${consumer.firstName} ${consumer.lastName}`,
          firstName: consumer.firstName,
          lastName: consumer.lastName,
          role: consumer.role,
          userType: "CONSUMER",
          isAdmin: consumer.isAdmin,
          isExecutive: consumer.role === "EXECUTIVE",
          isSeniorManager: false,
          isManager: false,
          b2bPartnerId: consumer.tenantId,
          organization: null,
          avatarUrl: null,
          mustChangePassword: consumer.mustChangePassword,
        };
      },
    }),
  ],
});
