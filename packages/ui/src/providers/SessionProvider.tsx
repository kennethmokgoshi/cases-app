'use client';

import { SessionProvider as NextAuthSessionProvider, useSession as _useSession, signOut, signIn } from 'next-auth/react';

export { signOut, signIn };

/**
 * Strongly-typed user shape populated by the shared-lib auth session callback.
 * Exported so server components can cast auth() results if needed.
 */
export interface AppUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
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

export interface AppSession {
    user: AppUser;
    expires: string;
}

/**
 * Typed wrapper around next-auth's useSession.
 * Returns our platform-specific user shape instead of the base User type,
 * which avoids TypeScript module-augmentation pitfalls with NextAuth v5 beta.
 */
export function useSession() {
    return _useSession() as unknown as {
        data: AppSession | null;
        status: 'authenticated' | 'unauthenticated' | 'loading';
        update: (data?: unknown) => Promise<AppSession | null>;
    };
}

export function SessionProvider({
    children }: {
    children: React.ReactNode;
}) {
    return (
        <NextAuthSessionProvider>
            {children}
        </NextAuthSessionProvider>
    );
}

