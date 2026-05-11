'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@zenowethu/ui';

// Client-side logger
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

// Types for the project hierarchy
type ProjectNode = {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    _count?: { cases: number };
};

type BranchNode = {
    name: string;
    projectId: string;
    totalCases: number;
    years: YearNode[];
};

type YearNode = {
    name: string;
    projectId: string;
    totalCases: number;
    months: MonthNode[];
};

type MonthNode = {
    name: string;
    projectId: string;
    cases: number;
};

// Month sort order for consistent ordering
const MONTH_ORDER: Record<string, number> = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
};

export function B2BSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    const allMenuItems = [
        { label: 'My Cases', href: '/b2b-dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
        { label: '+Submit New Referral', href: '/b2b-dashboard/cases/new', icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Reporting', href: '/b2b-dashboard/reporting', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', managerOnly: true },
    ];

    // Filter menu - show Reports to admins, Reporting to managers
    const menuItems = allMenuItems.filter(item => {
        if ((item as any).adminOnly) return session?.user?.isAdmin;
        if ((item as any).managerOnly) return session?.user?.isManager || session?.user?.isAdmin;
        return true;
    });

    const [timelineData, setTimelineData] = useState<any>({});
    const [projectData, setProjectData] = useState<ProjectNode[]>([]);
    const [viewMode, setViewMode] = useState<'TIME' | 'SOURCE'>('SOURCE');
    const [expandedYears, setExpandedYears] = useState<string[]>([]);
    // Track expanded branches and their years: "branchId" or "branchId:year"
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (session?.user) {
            // Fetch cases for timeline — slim=true returns only {id, createdAt}
            fetch('/api/cases?slim=true')
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

            // Fetch ALL projects for source view (including those with 0 cases - we need the hierarchy)
            fetch('/api/projects?flat=true&slim=true')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setProjectData(data);
                    }
                })
                .catch(err => logger.error('Failed to fetch projects for source view:', err));
        }
    }, [session]);

    // Build the Branch → Year → Month hierarchy from flat project data
    const branchHierarchy = useMemo<BranchNode[]>(() => {
        if (projectData.length === 0) return [];

        // Build a lookup map
        const byId = new Map<string, ProjectNode>();
        const childrenOf = new Map<string, ProjectNode[]>();

        projectData.forEach(p => {
            byId.set(p.id, p);
            if (p.parentId) {
                const existing = childrenOf.get(p.parentId) || [];
                existing.push(p);
                childrenOf.set(p.parentId, existing);
            }
        });

        // Find all BRANCH or FOLDER type nodes that could be branches
        // Also consider: some projects might just be named after branches without the BRANCH type
        // The hierarchy is: ROOT > ACQUISITION_SOURCE > BRANCH > YEAR > MONTH
        // Or sometimes: ROOT > ACQUISITION_SOURCE > YEAR > MONTH (no branch level)

        // Strategy: Walk the tree from leaves (MONTH nodes with cases) upward to find the structure
        // Better strategy: Find BRANCH-type nodes and build down, or find root sources and build down

        const branches: BranchNode[] = [];

        // Find branch-level nodes (type === BRANCH or FOLDER that are children of ACQUISITION_SOURCE)
        const branchNodes = projectData.filter(p => p.type === 'BRANCH' || p.type === 'FOLDER');

        // For each branch, find its Year and Month children
        for (const branch of branchNodes) {
            const yearChildren = (childrenOf.get(branch.id) || [])
                .filter(c => c.type === 'YEAR')
                .sort((a, b) => b.name.localeCompare(a.name)); // Most recent year first

            if (yearChildren.length === 0) continue; // Skip folders without year structure

            const years: YearNode[] = [];

            for (const year of yearChildren) {
                const monthChildren = (childrenOf.get(year.id) || [])
                    .filter(c => c.type === 'MONTH')
                    .sort((a, b) => (MONTH_ORDER[b.name] || 99) - (MONTH_ORDER[a.name] || 99)); // Most recent month first

                const months: MonthNode[] = monthChildren.map(m => ({
                    name: m.name,
                    projectId: m.id,
                    cases: m._count?.cases || 0,
                }));

                // Year total = sum of its month cases + direct year cases
                const yearDirectCases = year._count?.cases || 0;
                const yearTotalCases = months.reduce((sum, m) => sum + m.cases, 0) + yearDirectCases;

                if (yearTotalCases > 0 || months.some(m => m.cases > 0)) {
                    years.push({
                        name: year.name,
                        projectId: year.id,
                        totalCases: yearTotalCases,
                        months: months.filter(m => m.cases > 0),
                    });
                }
            }

            // Branch total = sum of all year totals + direct branch cases
            const branchDirectCases = branch._count?.cases || 0;
            const branchTotalCases = years.reduce((sum, y) => sum + y.totalCases, 0) + branchDirectCases;

            if (branchTotalCases > 0) {
                branches.push({
                    name: branch.name,
                    projectId: branch.id,
                    totalCases: branchTotalCases,
                    years: years.filter(y => y.totalCases > 0),
                });
            }
        }

        // Also handle cases where YEAR nodes are direct children of ACQUISITION_SOURCE (no branch level)
        // Find ACQUISITION_SOURCE nodes
        const sourceNodes = projectData.filter(p => p.type === 'ACQUISITION_SOURCE');
        for (const source of sourceNodes) {
            const directYearChildren = (childrenOf.get(source.id) || [])
                .filter(c => c.type === 'YEAR');

            if (directYearChildren.length === 0) continue;

            // Check if this source already has branches we've processed
            const sourceBranches = (childrenOf.get(source.id) || [])
                .filter(c => c.type === 'BRANCH' || c.type === 'FOLDER');
            if (sourceBranches.length > 0) continue; // Already handled above

            const years: YearNode[] = [];
            for (const year of directYearChildren.sort((a, b) => b.name.localeCompare(a.name))) {
                const monthChildren = (childrenOf.get(year.id) || [])
                    .filter(c => c.type === 'MONTH')
                    .sort((a, b) => (MONTH_ORDER[b.name] || 99) - (MONTH_ORDER[a.name] || 99));

                const months: MonthNode[] = monthChildren.map(m => ({
                    name: m.name,
                    projectId: m.id,
                    cases: m._count?.cases || 0,
                }));

                const yearDirectCases = year._count?.cases || 0;
                const yearTotalCases = months.reduce((sum, m) => sum + m.cases, 0) + yearDirectCases;

                if (yearTotalCases > 0) {
                    years.push({
                        name: year.name,
                        projectId: year.id,
                        totalCases: yearTotalCases,
                        months: months.filter(m => m.cases > 0),
                    });
                }
            }

            const sourceDirectCases = source._count?.cases || 0;
            const sourceTotalCases = years.reduce((sum, y) => sum + y.totalCases, 0) + sourceDirectCases;

            if (sourceTotalCases > 0) {
                // Use source name as "branch" name (e.g., "Letsatsi Referrals")
                // Clean up the name
                let displayName = source.name;
                displayName = displayName.replace(/\s*Referrals?\s*/i, '').trim() || source.name;

                branches.push({
                    name: displayName,
                    projectId: source.id,
                    totalCases: sourceTotalCases,
                    years,
                });
            }
        }

        // Sort branches alphabetically
        return branches.sort((a, b) => a.name.localeCompare(b.name));
    }, [projectData]);

    // Auto-expand current year in branches on first load
    useEffect(() => {
        if (branchHierarchy.length > 0 && expandedNodes.size === 0) {
            const currentYear = new Date().getFullYear().toString();
            const newExpanded = new Set<string>();
            // Auto-expand all branches and current year
            branchHierarchy.forEach(branch => {
                newExpanded.add(branch.projectId);
                const currentYearNode = branch.years.find(y => y.name === currentYear);
                if (currentYearNode) {
                    newExpanded.add(`${branch.projectId}:${currentYearNode.name}`);
                }
            });
            setExpandedNodes(newExpanded);
        }
    }, [branchHierarchy]);

    const toggleNode = (key: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const toggleYear = (year: string) => {
        setExpandedYears((prev: string[]) =>
            prev.includes(year) ? prev.filter((y: string) => y !== year) : [...prev, year]
        );
    };

    const sortedYears = Object.keys(timelineData).sort((a, b) => b.localeCompare(a));

    // Chevron icon component
    const Chevron = ({ expanded }: { expanded: boolean }) => (
        <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
    );

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

                {/* Sources / Timeline Section */}
                <div className="pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">
                            {viewMode === 'SOURCE' ? 'Sources' : 'Timeline'}
                        </h3>
                        <button
                            onClick={() => setViewMode((prev: 'TIME' | 'SOURCE') => prev === 'TIME' ? 'SOURCE' : 'TIME')}
                            className="text-[10px] text-zeno-cyan hover:text-white transition-colors border border-zeno-cyan/30 rounded px-1.5 py-0.5 bg-zeno-cyan/5 whitespace-nowrap"
                        >
                            {viewMode === 'SOURCE' ? 'Sort by Date' : 'Sort by Source'}
                        </button>
                    </div>

                    <div className="space-y-0.5">
                        {viewMode === 'SOURCE' ? (
                            /* ═══════════════════════════════════════════
                               SOURCES VIEW: Branch → Year → Month
                               ═══════════════════════════════════════════ */
                            branchHierarchy.length === 0 ? (
                                <p className="text-xs text-gray-600 px-3 py-2 italic">No sources found</p>
                            ) : (
                                branchHierarchy.map(branch => {
                                    const branchExpanded = expandedNodes.has(branch.projectId);
                                    return (
                                        <div key={branch.projectId}>
                                            {/* ── Branch Level ── */}
                                            <div className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors group">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <button
                                                        onClick={() => toggleNode(branch.projectId)}
                                                        className="shrink-0 hover:text-white transition-colors"
                                                        aria-label={branchExpanded ? 'Collapse' : 'Expand'}
                                                    >
                                                        <Chevron expanded={branchExpanded} />
                                                    </button>
                                                    <svg className="w-3.5 h-3.5 text-zeno-cyan/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                    <Link
                                                        href={`/b2b-dashboard/cases?projectId=${branch.projectId}`}
                                                        className="font-semibold truncate hover:text-zeno-cyan transition-colors"
                                                    >
                                                        {branch.name}
                                                    </Link>
                                                </div>
                                                <Link
                                                    href={`/b2b-dashboard/cases?projectId=${branch.projectId}`}
                                                    className="text-[10px] bg-zeno-cyan/10 text-zeno-cyan px-1.5 py-0.5 rounded font-medium shrink-0 ml-2 hover:bg-zeno-cyan/20 transition-colors"
                                                >
                                                    {branch.totalCases}
                                                </Link>
                                            </div>

                                            {/* ── Year Level ── */}
                                            {branchExpanded && (
                                                <div className="ml-3 pl-3 border-l border-white/5 mt-0.5 space-y-0.5">
                                                    {branch.years.map(year => {
                                                        const yearKey = `${branch.projectId}:${year.name}`;
                                                        const yearExpanded = expandedNodes.has(yearKey);
                                                        return (
                                                            <div key={yearKey}>
                                                                <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors group">
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => toggleNode(yearKey)}
                                                                            className="shrink-0 hover:text-white transition-colors"
                                                                            aria-label={yearExpanded ? 'Collapse' : 'Expand'}
                                                                        >
                                                                            <Chevron expanded={yearExpanded} />
                                                                        </button>
                                                                        <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                        </svg>
                                                                        <Link
                                                                            href={`/b2b-dashboard/cases?projectId=${year.projectId}`}
                                                                            className="font-medium hover:text-zeno-cyan transition-colors"
                                                                        >
                                                                            {year.name}
                                                                        </Link>
                                                                    </div>
                                                                    <Link
                                                                        href={`/b2b-dashboard/cases?projectId=${year.projectId}`}
                                                                        className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white/10 transition-colors hover:text-white"
                                                                    >
                                                                        {year.totalCases}
                                                                    </Link>
                                                                </div>

                                                                {/* ── Month Level ── */}
                                                                {yearExpanded && (
                                                                    <div className="ml-3 pl-3 border-l border-white/5 mt-0.5 space-y-0.5">
                                                                        {year.months.map(month => (
                                                                            <Link
                                                                                key={month.projectId}
                                                                                href={`/b2b-dashboard/cases?projectId=${month.projectId}`}
                                                                                className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors rounded-md hover:bg-white/5"
                                                                            >
                                                                                <span>{month.name}</span>
                                                                                <span className="text-[10px] text-gray-600">
                                                                                    {month.cases}
                                                                                </span>
                                                                            </Link>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )
                        ) : (
                            /* ═══════════════════════════════════════════
                               TIMELINE VIEW: Year → Month  (unchanged)
                               ═══════════════════════════════════════════ */
                            sortedYears.map(year => (
                                <div key={year} className="group">
                                    <button
                                        onClick={() => toggleYear(year)}
                                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Chevron expanded={expandedYears.includes(year)} />
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
