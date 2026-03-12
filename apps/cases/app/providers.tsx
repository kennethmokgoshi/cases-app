'use client';

import { SessionProvider, ThemeProvider } from '@zenowethu/ui';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <SessionProvider>
                {children}
            </SessionProvider>
        </ThemeProvider>
    );
}
