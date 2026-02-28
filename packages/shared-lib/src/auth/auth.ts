import NextAuth, { DefaultSession, User } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role: string;
            isAdmin: boolean;
            isManager: boolean;
            userType: string;
            b2bPartnerId: string | null;
            firstName: string | null;
            lastName: string | null;
            organization: string | null;
            avatarUrl: string | null;
        } & DefaultSession["user"]
    }

    interface User {
        role: string;
        isAdmin: boolean;
        isManager: boolean;
        userType: string;
        b2bPartnerId: string | null;
        firstName: string | null;
        lastName: string | null;
        organization: string | null;
        avatarUrl: string | null;
    }
}

import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@zenowethu/database"
import { authConfig } from "./auth.config"
import { createLogger } from "../logger"

const log = createLogger('auth');

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                try {
                    if (!credentials?.email || !credentials?.password) {
                        log.warn('Login attempt rejected: missing credentials');
                        throw new Error('Missing credentials');
                    }

                    // Convert email to lowercase for case-insensitive login
                    const emailLowerCase = (credentials.email as string).toLowerCase();

                    log.info('Login attempt received');

                    const user = await prisma.user.findUnique({
                        where: { email: emailLowerCase }
                    });

                    if (!user) {
                        // Generic log — do not reveal whether the email exists
                        log.warn('Login failed: unrecognised credentials');
                        throw new Error('Email not recognised');
                    }

                    if (user.isLocked) {
                        log.warn({ userId: user.id }, 'Login failed: account is locked');
                        throw new Error('Account is locked');
                    }

                    const passwordMatch = await bcrypt.compare(
                        credentials.password as string,
                        user.password
                    );

                    if (!passwordMatch) {
                        // Do NOT log the passwordMatch boolean — it confirms hash validity to log readers
                        log.warn({ userId: user.id }, 'Login failed: invalid password');
                        throw new Error('Invalid password');
                    }

                    // Update last login timestamp
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { lastLogin: new Date() }
                    });

                    log.info({ userId: user.id, role: user.role }, 'Login successful');

                    const userRole = (user as { role?: string }).role || 'MEMBER';

                    return {
                        id: user.id,
                        email: user.email,
                        name: `${user.firstName} ${user.lastName}`,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        organization: user.organization,
                        role: userRole,
                        isAdmin: userRole === 'ADMIN',
                        isManager: userRole === 'MANAGER' || userRole === 'ADMIN',
                        userType: (user as { userType?: string }).userType || 'STAFF',
                        b2bPartnerId: (user as { b2bPartnerId?: string | null }).b2bPartnerId || null,
                        avatarUrl: (user as { avatarUrl?: string | null }).avatarUrl || null };
                } catch (error) {
                    log.error({ err: error }, 'Authentication error');
                    throw error;
                }
            }
        })
    ]
})
