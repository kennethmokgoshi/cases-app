import NextAuth, { DefaultSession, User } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role: string;
            isAdmin: boolean;
            isExecutive: boolean;
            isSeniorManager: boolean;
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
        isExecutive: boolean;
        isSeniorManager: boolean;
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
import { buildUserLoginLookup, normalizeLoginIdentifier } from "./login-identifier"

const log = createLogger('auth');

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                email: { label: "Email or username", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                try {
                    if (!credentials?.email || !credentials?.password) {
                        log.warn('Login attempt rejected: missing credentials');
                        throw new Error('Missing credentials');
                    }

                    const loginIdentifier = normalizeLoginIdentifier(credentials.email as string);

                    log.info('Login attempt received');

                    const user = await prisma.user.findFirst({
                        where: buildUserLoginLookup(loginIdentifier)
                    });

                    if (!user) {
                        // Generic log — do not reveal whether the email exists
                        log.warn('Login failed: unrecognised credentials');
                        throw new Error('Login not recognised');
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
                    const isAdmin = userRole === 'ADMIN' || (user as { isAdmin?: boolean }).isAdmin === true;
                    const isExecutive = isAdmin || userRole === 'EXECUTIVE';
                    const isSeniorManager = isExecutive || userRole === 'SENIOR_MANAGER';
                    const isManager = isSeniorManager || userRole === 'MANAGER';

                    return {
                        id: user.id,
                        email: user.email,
                        name: `${user.firstName} ${user.lastName}`,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        organization: user.organization,
                        role: userRole,
                        isAdmin,
                        isExecutive,
                        isSeniorManager,
                        isManager,
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
