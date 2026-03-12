'use client';

import { B2BSidebar } from './components/B2BSidebar';
import { useSession, signOut } from '@zenowethu/ui';
import Link from 'next/link';
import { DashboardSwitcher } from '@zenowethu/ui';
import B2BClientSearch from './components/B2BClientSearch';
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

export default function B2BLayout({
    children }: {
    children: React.ReactNode;
}) {
    const { data: session } = useSession();

    return (
        <div className="min-h-screen bg-zeno-navy flex">
            {/* Sidebar */}
            <B2BSidebar />

            {/* Main Content Area */}
            <div className="flex-1 ml-64 flex flex-col min-w-0">
                {/* Top Header */}
                <header className="h-20 bg-zeno-navy/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40 px-8 flex items-center justify-between gap-4">
                    {/* Search Bar - Takes most of the space */}
                    <div className="flex-1 max-w-2xl">
                        <B2BClientSearch />
                    </div>

                    <div className="flex items-center gap-6 flex-shrink-0">
                        <DashboardSwitcher />

                        {/* User Profile */}
                        <Link
                            href="/account"
                            className="flex items-center gap-3 pl-6 border-l border-white/10 group hover:bg-white/5 transition-all px-3 py-1 rounded-xl"
                        >
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-white group-hover:text-zeno-cyan transition-colors">
                                    {session?.user?.firstName} {session?.user?.lastName}
                                </p>
                                <p className="text-xs text-zeno-cyan">{session?.user?.organization}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zeno-cyan to-blue-600 p-[2px]">
                                <div className="w-full h-full rounded-full bg-zeno-gray flex items-center justify-center overflow-hidden border border-white/10">
                                    {session?.user?.avatarUrl ? (
                                        <img src={session?.user?.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-lg font-bold text-white uppercase">
                                            {session?.user?.firstName?.[0]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>

                        <button
                            onClick={async () => {
                                try {
                                    await signOut({ callbackUrl: '/login', redirect: true });
                                } catch (error) {
                                    logger.error('Logout error:', error);
                                    // Force redirect even if error
                                    window.location.href = '/login';
                                }
                            }}
                            className="ml-2 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10"
                            title="Sign Out"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-8 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
