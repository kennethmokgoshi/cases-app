import { TopBar } from '@zenowethu/ui';
import { Sidebar } from '@zenowethu/ui';
import { MobileBottomNav } from '@zenowethu/ui';
import { PWAInstallPrompt } from '@zenowethu/ui';
import { LayoutProvider } from "@zenowethu/ui";

// Force dynamic rendering for all authenticated routes (they require auth + DB access)
export const dynamic = 'force-dynamic';

export default function AuthenticatedLayout({
    children }: {
    children: React.ReactNode;
}) {
    return (
        <LayoutProvider>
            <TopBar />
            <Sidebar />
            {/* Main content area with responsive margin/padding */}
            <main
                className="flex-1 min-h-screen bg-[var(--color-bg-primary)] transition-all duration-300
                           px-4 py-20 pb-24
                           md:px-6 md:py-20
                           lg:p-8 lg:pt-20 lg:pb-8"
                style={{ marginLeft: 'var(--sidebar-width-actual, 0px)' }}
            >
                {children}
            </main>
            {/* Mobile Bottom Navigation */}
            <MobileBottomNav />
            {/* PWA Install Prompt */}
            <PWAInstallPrompt />
        </LayoutProvider>
    );
}

