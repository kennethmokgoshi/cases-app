'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BRANDING } from '@zenowethu/config';
import { NotificationBell } from '../NotificationBell';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { SearchWithSuggestions } from '../ui/SearchWithSuggestions';
import { OrgSearchWithSuggestions } from '../ui/OrgSearchWithSuggestions';
import { DashboardSwitcher } from './DashboardSwitcher';
import { GlobalAppSwitcher } from './GlobalAppSwitcher';
import { useLayout } from '../providers/layout-context';

/**
 * Error boundary that silently catches useSession errors caused by
 * missing SessionProvider (module duplication in monorepo/turbopack).
 */
class SessionErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

export function TopBar() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render during SSR to avoid useSession without SessionProvider
    if (!mounted) return null;

    return (
        <SessionErrorBoundary>
            <TopBarInner />
        </SessionErrorBoundary>
    );
}

function TopBarInner() {
    const { data: session } = useSession();
    const { toggleMobileMenu, isMobileOpen } = useLayout();
    const [searchMode, setSearchMode] = useState<'CLIENTS' | 'ORG'>('CLIENTS');

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] z-50 flex items-center px-4 md:px-6 shadow-sm">
            {/* Left: Hamburger + Branding */}
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
                {/* Mobile Hamburger Button */}
                <button
                    onClick={toggleMobileMenu}
                    className={`lg:hidden hamburger-btn ${isMobileOpen ? 'open' : ''} !relative !top-0 !left-0 !w-10 !h-10 !p-0`}
                    aria-label="Toggle menu"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    {/* Logo Spot */}
                    <div className="w-8 h-8 bg-gradient-to-br from-zeno-cyan to-zeno-navy rounded flex items-center justify-center border border-zeno-cyan/50">
                        <div className="w-3 h-3 bg-zeno-orange rotate-45"></div>
                    </div>
                    {/* Name Spot */}
                    <h1 className="text-xl font-bold text-white tracking-tight uppercase hidden md:block">
                        {BRANDING.appName}
                    </h1>
                </Link>
            </div>

            {/* Center: Dual Search Bar with Scope Switcher */}
            <div className="flex-1 flex items-center justify-center gap-2 px-2 md:px-6 max-w-4xl mx-auto">
                {/* Search Mode Toggle */}
                <div className="hidden sm:flex items-center gap-0.5 bg-[#06101E] border border-white/10 rounded-lg p-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => setSearchMode('CLIENTS')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            searchMode === 'CLIENTS'
                                ? 'bg-zeno-cyan text-slate-950 shadow'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="Search Clients (e.g. Adolph, Mnguni) & Cases by ID / File #"
                    >
                        👤 Clients
                    </button>
                    <button
                        type="button"
                        onClick={() => setSearchMode('ORG')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            searchMode === 'ORG'
                                ? 'bg-emerald-400 text-slate-950 shadow'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="Search Projects, Referrers (e.g. William), Branches (e.g. Paul Kruger 1), Main Sources & Sub-Projects"
                    >
                        📁 Projects & Referrers
                    </button>
                </div>

                {/* Active Search Input */}
                <div className="w-full lg:max-w-2xl">
                    {searchMode === 'CLIENTS' ? (
                        <SearchWithSuggestions
                            placeholder="Search clients (Adolph, Mnguni) & cases..."
                            className="bg-zeno-navy border border-white/10 focus:border-zeno-cyan/50 w-full"
                        />
                    ) : (
                        <OrgSearchWithSuggestions
                            placeholder="Search projects, referrers (William), branches (Paul Kruger 1), sources..."
                            className="bg-zeno-navy border border-white/10 focus:border-emerald-400/50 w-full"
                        />
                    )}
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center justify-end gap-2 md:gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-2 md:gap-4">
                    <GlobalAppSwitcher />
                    <div className="h-6 w-px bg-white/10 mx-1 md:mx-2"></div>
                    <DashboardSwitcher />
                    <div className="h-6 w-px bg-white/10 mx-1 md:mx-2"></div>
                    <ThemeSwitcher />
                </div>
                <NotificationBell />
            </div>
        </header>
    );
}
