'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export function GlobalAppSwitcher() {
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

    // Show to authenticated users only (Hidden for B2B Partners)
    if (!session?.user || (session.user as any).userType === 'B2B_PARTNER') {
        return null; // Explicitly hidden for B2B as requested
    }

    const { role } = session.user as any;
    const canAccessFinance = ['FINANCE', 'EXECUTIVE', 'ADMIN'].includes(role);

    const apps = [
        {
            name: 'Cases Core',
            href: 'http://localhost:3000/',
            icon: '🏢',
            description: 'Group Command Center',
            active: currentPort === '3000'
        },
        {
            name: 'Insurance Division',
            href: 'http://localhost:3001/',
            icon: '🛡️',
            description: 'Policy Audits & Assessments',
            active: currentPort === '3001'
        },
        {
            name: 'Legal Division',
            href: 'http://localhost:3002/',
            icon: '⚖️',
            description: 'Rescissions & Collections',
            active: currentPort === '3002'
        },
        {
            name: 'Forensic Division',
            href: 'http://localhost:3003/',
            icon: '🕵️‍♂️',
            description: 'Fraud & Reckless Lending',
            active: currentPort === '3003'
        },
        ...(canAccessFinance ? [{
            name: 'Finance & Accounts',
            href: 'http://localhost:3004/',
            icon: '💳',
            description: 'Payments & Reconciliation',
            active: currentPort === '3004'
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
