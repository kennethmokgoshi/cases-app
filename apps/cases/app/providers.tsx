'use client';

import { SessionProvider, ThemeProvider, Toaster, ConfirmProvider } from '@zenowethu/ui';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <SessionProvider>
                <ConfirmProvider>
                    {children}
                </ConfirmProvider>
                <Toaster />
            </SessionProvider>
        </ThemeProvider>
    );
}
