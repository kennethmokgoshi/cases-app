'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export function GlobalAppSwitcher() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render during SSR to avoid useSession without SessionProvider
    if (!mounted) return null;

    return <GlobalAppSwitcherInner />;
}

function GlobalAppSwitcherInner() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [currentPort, setCurrentPort] = useState('');

    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

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

    // Show only to ADMIN, EXECUTIVE, SENIOR_MANAGER (hidden for everyone else including B2B)
    const { role, isAdmin, isExecutive, isSeniorManager } = session?.user as any ?? {};
    const canSwitchApps = isAdmin || isExecutive || isSeniorManager;
    if (!session?.user || !canSwitchApps) {
        return null;
    }

    const canAccessFinance = isAdmin || isExecutive || isSeniorManager || role === 'FINANCE' || role === 'ACCOUNTS';

    const isActiveApp = (port: string, hostname: string) =>
        isLocalhost ? currentPort === port : window.location.hostname === hostname;

    const apps = [
        {
            name: 'Cases Core',
            href: isLocalhost ? 'http://localhost:3000/' : 'https://cases.zenowethu.co.za/',
            icon: '🏢',
            description: 'Group Command Center',
            active: isActiveApp('3000', 'cases.zenowethu.co.za')
        },
        {
            name: 'Insurance Division',
            href: isLocalhost ? 'http://localhost:3001/' : 'https://insurance.zenowethu.co.za/',
            icon: '🛡️',
            description: 'Policy Audits & Assessments',
            active: isActiveApp('3001', 'insurance.zenowethu.co.za')
        },
        {
            name: 'Legal Division',
            href: isLocalhost ? 'http://localhost:3002/' : 'https://legal.zenowethu.co.za/',
            icon: '⚖️',
            description: 'Rescissions & Collections',
            active: isActiveApp('3002', 'legal.zenowethu.co.za')
        },
        {
            name: 'Forensic Division',
            href: isLocalhost ? 'http://localhost:3003/' : 'https://forensic.zenowethu.co.za/',
            icon: '🕵️‍♂️',
            description: 'Fraud & Reckless Lending',
            active: isActiveApp('3003', 'forensic.zenowethu.co.za')
        },
        ...(canAccessFinance ? [{
            name: 'Finance & Accounts',
            href: isLocalhost ? 'http://localhost:3004/' : 'https://accounts.zenowethu.co.za/',
            icon: '💳',
            description: 'Payments & Reconciliation',
            active: isActiveApp('3004', 'accounts.zenowethu.co.za')
        }] : [])
    ];

    const currentApp = apps.find(a => a.active) || apps[0];

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
                    <span className="text-lg">{currentApp.icon}</span>
                    <div className="text-left hidden lg:block">
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1 font-bold">App</p>
                        <p className="text-sm font-bold text-white leading-none">{currentApp.name}</p>
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
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2">Switch Application</h4>
                    </div>
                    <div className="p-2 space-y-1">
                        {apps.map((app) => (
                            <Link
                                key={app.href}
                                href={app.href}
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-4 p-3 rounded-xl transition-all group ${app.active
                                    ? 'bg-zeno-cyan/10 border border-zeno-cyan/20'
                                    : 'hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${app.active ? 'bg-zeno-cyan text-zeno-navy' : 'bg-white/5 group-hover:bg-white/10'
                                    }`}>
                                    {app.icon}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-sm font-bold ${app.active ? 'text-zeno-cyan' : 'text-white'}`}>
                                        {app.name}
                                    </p>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {app.description}
                                    </p>
                                </div>
                                {app.active && (
                                    <div className="w-2 h-2 rounded-full bg-zeno-cyan shadow-[0_0_8px_#22d3ee]"></div>
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
