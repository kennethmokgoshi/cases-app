import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@zenowethu/database";
import { z } from "zod";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const consumer = await prisma.consumerAccount.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            password: true,
            role: true,
            isAdmin: true,
            tenantId: true,
          },
        });

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
