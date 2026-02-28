'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export function DashboardSwitcher() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [currentPort, setCurrentPort] = useState('');

    // Close on click outside & Get Port
    useEffect(() => {
        setCurrentPort(window.location.port);
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show to Authenticated ADMINS only (as per requirement)
    // "dashboard switcher for admin on cases just cases"
    if (!session?.user || !(session.user as any).isAdmin) {
        return null;
    }

    const dashboards = [
        {
            name: 'Director View',
            href: '/',
            icon: '🏢',
            description: 'Group Command Center',
            active: pathname === '/' || (pathname.startsWith('/cases') && !pathname.startsWith('/cases/new'))
        },
        {
            name: 'Partner Portal',
            href: '/b2b-dashboard',
            icon: '🤝',
            description: 'B2B Partner Dashboard',
            active: pathname.startsWith('/b2b-dashboard')
        },
        ...(session?.user?.isAdmin ? [{
            name: 'System Admin',
            href: '/admin',
            icon: '⚙️',
            description: 'User Management & Settings',
            active: pathname.startsWith('/admin')
        }] : [])
    ];

    const currentDashboard = dashboards.find(d => d.active) || dashboards[0];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all duration-300 ${isOpen
                    ? 'border-zeno-cyan bg-zeno-cyan/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                    }`}
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">{currentDashboard.icon}</span>
                    <div className="text-left hidden lg:block">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1 font-bold">Dashboard</p>
                        <p className="text-sm font-bold text-white leading-none">{currentDashboard.name}</p>
                    </div>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-72 bg-zeno-navy/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-white/5 bg-white/5">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2">Navigation Dashboards</h4>
                    </div>
                    <div className="p-2 space-y-1">
                        {dashboards.map((dash) => (
                            <Link
                                key={dash.href}
                                href={dash.href}
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-4 p-3 rounded-xl transition-all group ${dash.active
                                    ? 'bg-zeno-cyan/10 border border-zeno-cyan/20'
                                    : 'hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${dash.active ? 'bg-zeno-cyan text-zeno-navy' : 'bg-white/5 group-hover:bg-white/10'
                                    }`}>
                                    {dash.icon}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-sm font-bold ${dash.active ? 'text-zeno-cyan' : 'text-white'}`}>
                                        {dash.name}
                                    </p>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {dash.description}
                                    </p>
                                </div>
                                {dash.active && (
                                    <div className="w-2 h-2 rounded-full bg-zeno-cyan shadow-[0_0_8px_#22d3ee]"></div>
                                )}
                            </Link>
                        ))}
                    </div>
                    <div className="p-3 bg-black/20 border-t border-white/5 text-[10px] text-gray-500 text-center font-medium">
                        Logged in as <span className="text-gray-300 font-bold">{(session?.user as any)?.role}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
