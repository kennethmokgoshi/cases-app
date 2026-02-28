'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { logger } from '@zenowethu/shared-lib';

export function B2BSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    const allMenuItems = [
        { label: 'Dashboard', href: '/b2b-dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
        { label: 'Submit Referral', href: '/b2b-dashboard/cases/new', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
        { label: 'Cases', href: '/b2b-dashboard/cases', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
        { label: 'My Cases', href: '/b2b-dashboard/cases?filter=my-cases', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { label: 'Reporting', href: '/b2b-dashboard/reporting', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', managerOnly: true },
        { label: 'Reports', href: '/b2b-dashboard/reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', adminOnly: true },
    ];

    // Filter menu - show Reports to admins, Reporting to managers
    const menuItems = allMenuItems.filter(item => {
        if (item.adminOnly) return session?.user?.isAdmin;
        if (item.managerOnly) return session?.user?.isManager || session?.user?.isAdmin;
        return true;
    });

    const [timelineData, setTimelineData] = useState<any>({});
    const [projectData, setProjectData] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'TIME' | 'SOURCE'>('TIME');
    const [expandedYears, setExpandedYears] = useState<string[]>([]);
    const [expandedProjects, setExpandedProjects] = useState<string[]>([]);

    useEffect(() => {
        if (session?.user) {
            // Fetch cases for timeline
            fetch('/api/cases')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        const grouped = data.reduce((acc: any, c: any) => {
                            const date = new Date(c.createdAt);
                            const year = date.getFullYear().toString();
                            const month = date.toLocaleString('default', { month: 'long' });

                            if (!acc[year]) acc[year] = { count: 0, months: {} };
                            acc[year].count++;

                            if (!acc[year].months[month]) acc[year].months[month] = 0;
                            acc[year].months[month]++;

                            return acc;
                        }, {});
                        setTimelineData(grouped);
                        const currentYear = new Date().getFullYear().toString();
                        if (grouped[currentYear]) {
                            setExpandedYears([currentYear]);
                        }
                    }
                })
                .catch(err => logger.error('Failed to fetch cases for timeline:', err));

            // Fetch projects for source view
            fetch('/api/projects?flat=true')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setProjectData(data.filter(p => (p._count?.cases || 0) > 0));
                    }
                })
                .catch(err => logger.error('Failed to fetch projects for source view:', err));
        }
    }, [session]);

    const toggleYear = (year: string) => {
        setExpandedYears((prev: string[]) =>
            prev.includes(year) ? prev.filter((y: string) => y !== year) : [...prev, year]
        );
    };

    const toggleProject = (id: string) => {
        setExpandedProjects((prev: string[]) =>
            prev.includes(id) ? prev.filter((p: string) => p !== id) : [...prev, id]
        );
    };

    const sortedYears = Object.keys(timelineData).sort((a, b) => b.localeCompare(a));

    return (
        <aside className="fixed inset-y-0 left-0 w-64 bg-zeno-gray border-r border-white/10 z-50 flex flex-col overflow-y-auto">
            {/* Logo */}
            <div className="h-20 flex items-center px-6 border-b border-white/10 shrink-0">
                <Link href="/b2b-dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 bg-gradient-to-br from-zeno-cyan to-zeno-navy rounded-lg flex items-center justify-center border border-zeno-cyan/50">
                        <div className="w-3 h-3 bg-zeno-orange rotate-45"></div>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">ZENOWETHU</h1>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Partner Portal</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-8 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                ? 'bg-zeno-cyan/10 text-zeno-cyan border border-zeno-cyan/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                            </svg>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}

                {/* Timeline Section */}
                <div className="pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">
                            {viewMode === 'TIME' ? 'Timeline' : 'Sources'}
                        </h3>
                        <button
                            onClick={() => setViewMode((prev: 'TIME' | 'SOURCE') => prev === 'TIME' ? 'SOURCE' : 'TIME')}
                            className="text-[10px] text-zeno-cyan hover:text-white transition-colors border border-zeno-cyan/30 rounded px-1.5 py-0.5 bg-zeno-cyan/5 whitespace-nowrap"
                        >
                            {viewMode === 'TIME' ? 'Sort by Source' : 'Sort by Date'}
                        </button>
                    </div>

                    <div className="space-y-1">
                        {viewMode === 'TIME' ? (
                            sortedYears.map(year => (
                                <div key={year} className="group">
                                    <button
                                        onClick={() => toggleYear(year)}
                                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg
                                                className={`w-3 h-3 transition-transform ${expandedYears.includes(year) ? 'rotate-90' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                            <span className="font-medium">{year}</span>
                                        </div>
                                        <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white/10 transition-colors">
                                            {timelineData[year].count}
                                        </span>
                                    </button>

                                    {expandedYears.includes(year) && (
                                        <div className="ml-4 pl-4 border-l border-white/5 mt-1 space-y-1">
                                            {Object.keys(timelineData[year].months).map(month => (
                                                <Link
                                                    key={`${year}-${month}`}
                                                    href={`/b2b-dashboard/cases?year=${year}&month=${month}`}
                                                    className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors rounded-md hover:bg-white/5"
                                                >
                                                    <span>{month}</span>
                                                    <span className="text-[10px] text-gray-600">
                                                        {timelineData[year].months[month]}
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            projectData.map(project => (
                                <Link
                                    key={project.id}
                                    href={`/b2b-dashboard/cases?projectId=${project.id}`}
                                    className="flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/5"
                                >
                                    <span className="truncate">{project.name}</span>
                                    <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">
                                        {project._count?.cases || 0}
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </nav>

            {/* User Info */}
            <div className="p-4 border-t border-white/10">
                <Link
                    href="/account"
                    className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
                >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zeno-cyan to-cyan-600 flex items-center justify-center border-2 border-transparent group-hover:border-zeno-cyan transition-all">
                        {session?.user?.avatarUrl ? (
                            <img src={session?.user?.avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <span className="text-white font-bold text-sm">
                                {session?.user?.firstName?.[0]}{session?.user?.lastName?.[0]}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-zeno-cyan transition-colors">
                            {session?.user?.firstName} {session?.user?.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                    </div>
                </Link>
            </div>
        </aside>
    );
}
