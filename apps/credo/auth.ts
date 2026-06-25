import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import { z } from "zod";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Email or ID number", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const username = parsed.data.username.trim();

        // Try to find consumer by email first, then by ID number
        let consumer = await prisma.consumerAccount.findFirst({
          where: { email: username },
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
          },
        });

        // If not found by email, try by ID number
        if (!consumer && /^\d{13}$/.test(username)) {
          consumer = await prisma.consumerAccount.findUnique({
            where: { idNumber: username },
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
            },
          });
        }

        if (!consumer) return null;

        const valid = await bcrypt.compare(parsed.data.password, consumer.password);
        if (!valid) return null;

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
        };
      },
    }),
  ],
});
