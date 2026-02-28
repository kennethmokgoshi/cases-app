'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BRANDING } from '@zenowethu/config';
import { NotificationBell } from '../NotificationBell';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { SearchWithSuggestions } from '../ui/SearchWithSuggestions';
import { DashboardSwitcher } from './DashboardSwitcher';
import { GlobalAppSwitcher } from './GlobalAppSwitcher';
import { useLayout } from '../providers/layout-context';

export function TopBar() {
    const { data: session } = useSession();
    const { toggleMobileMenu, isMobileOpen } = useLayout();

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

            {/* Center: Search Bar (Centered and Larger) */}
            <div className="flex-1 flex justify-center px-4 md:px-8 max-w-4xl mx-auto">
                <div className="w-full lg:max-w-2xl">
                    <SearchWithSuggestions
                        placeholder="File #, ID, Name..."
                        className="bg-zeno-navy border border-white/10 focus:border-zeno-cyan/50 w-full"
                    />
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
