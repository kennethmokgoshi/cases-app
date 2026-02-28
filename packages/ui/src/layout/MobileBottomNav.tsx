'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const navItems = [
    {
        href: '/',
        label: 'Home',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ) },
    {
        href: '/cases',
        label: 'Cases',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ) },
    {
        href: '/cases/new',
        label: 'New',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
        ),
        primary: true },
    {
        href: '/projects',
        label: 'Projects',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
        ) },
    {
        href: '/account',
        label: 'Account',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ) },
];

export function MobileBottomNav() {
    const pathname = usePathname();
    const { data: session } = useSession();

    // Don't show on login or public pages
    if (!session) return null;

    return (
        <nav className="mobile-bottom-nav">
            {navItems.map((item) => {
                const isActive = item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                if (item.primary) {
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex-1 flex flex-col items-center justify-center py-2 relative"
                        >
                            <div className="absolute -top-4 w-14 h-14 bg-zeno-cyan rounded-full flex items-center justify-center shadow-lg shadow-zeno-cyan/30">
                                <span className="text-zeno-navy">{item.icon}</span>
                            </div>
                            <span className="text-xs text-zeno-cyan font-medium mt-6">{item.label}</span>
                        </Link>
                    );
                }

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors ${isActive
                                ? 'text-zeno-cyan'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        {item.icon}
                        <span className="text-xs mt-1 font-medium">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
