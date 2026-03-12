'use client';

import { SessionProvider as NextAuthSessionProvider, useSession, signOut, signIn } from 'next-auth/react';

export { useSession, signOut, signIn };

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

