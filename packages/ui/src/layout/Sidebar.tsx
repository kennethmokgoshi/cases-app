'use client';

import { useEffect, useState, Component, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLayout } from '../providers/layout-context';

// Sub-components
import type { ProjectNode } from './sidebar/sidebar-types';
import { logger } from './sidebar/sidebar-types';
import { buildSourceTree, buildTimeTree, calculateTotalCases } from './sidebar/sidebar-tree-utils';
import { ProjectTreeItem } from './sidebar/ProjectTreeItem';
import { SidebarNav } from './sidebar/SidebarNav';
import { UserProfileFooter } from './sidebar/UserProfileFooter';

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

export function Sidebar() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render during SSR to avoid useSession without SessionProvider
    if (!mounted) return null;

    return (
        <SessionErrorBoundary>
            <SidebarInner />
        </SessionErrorBoundary>
    );
}

function SidebarInner() {
    const { data: session } = useSession();
    const router = useRouter();
    const [projectTree, setProjectTree] = useState<ProjectNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pathname = usePathname();
    const [viewMode, setViewMode] = useState<'SOURCE' | 'TIME'>('TIME');

    // Auto-expand targets
    const currentYear = new Date().getFullYear().toString();
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const autoExpandDate = { year: currentYear, month: currentMonth };

    // Mobile menu state from context
    const { isMobileOpen, setIsMobileOpen } = useLayout();
    const [isMobile, setIsMobile] = useState(false);

    // Resizable sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    // Check if mobile and load saved width
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile) setIsMobileOpen(false);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            setSidebarWidth(parseInt(savedWidth, 10));
        }

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Handle mouse move while resizing
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            const clampedWidth = Math.min(Math.max(newWidth, 256), 480);
            setSidebarWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                localStorage.setItem('sidebarWidth', sidebarWidth.toString());
            }
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, sidebarWidth]);

    // Sync sidebar width to CSS variable for layout
    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
        if (!isMobile) {
            document.documentElement.style.setProperty('--sidebar-width-actual', `${sidebarWidth}px`);
        } else {
            document.documentElement.style.setProperty('--sidebar-width-actual', '0px');
        }
    }, [sidebarWidth, isMobile]);

    // Close mobile menu on navigation
    useEffect(() => {
        setIsMobileOpen(false);
    }, [pathname]);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileOpen]);

    // Fetch projects
    useEffect(() => {
        async function fetchProjects() {
            try {
                const [statsResult, projectsResult] = await Promise.allSettled([
                    fetch('/api/dashboard/stats'),
                    fetch('/api/projects?flat=true&all=true&slim=true')
                ]);

                let totalCasesOverride = 0;
                let timelineStats = undefined;
                if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
                    try {
                        const stats = await statsResult.value.json();
                        totalCasesOverride = stats.totalActiveCases || stats.totalCases || 0;
                        timelineStats = stats.timeline;
                    } catch (e) {
                        logger.error('Failed to parse stats', e);
                    }
                }

                if (projectsResult.status === 'rejected') {
                    throw new Error('Network error fetching projects');
                }
                const res = projectsResult.value;
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`API Error ${res.status}: ${text.substring(0, 100)}...`);
                }
                const data = await res.json();

                if (Array.isArray(data)) {
                    let tree: ProjectNode[] = [];
                    if (viewMode === 'TIME') {
                        tree = buildTimeTree(data, timelineStats);
                    } else {
                        tree = buildSourceTree(data);
                    }

                    // Filter out projects with 0 cases (recursively)
                    const filterTree = (nodes: ProjectNode[]): ProjectNode[] => {
                        return nodes.filter(node => {
                            if (node.children && node.children.length > 0) {
                                node.children = filterTree(node.children);
                            }
                            const total = calculateTotalCases(node);
                            return total > 0;
                        });
                    };

                    tree = filterTree(tree);

                    if (totalCasesOverride > 0) {
                        const myCases = tree.find(n => n.name === 'My Cases');
                        if (myCases) {
                            (myCases as any)._overrideTotal = totalCasesOverride;
                        }
                    }

                    setProjectTree(tree);
                } else {
                    setProjectTree([]);
                }
            } catch (error: any) {
                logger.error('Failed to fetch projects', error);
                setError(error.message || 'Failed to load projects');
            } finally {
                setLoading(false);
            }
        }
        fetchProjects();
    }, [viewMode]);

    // Shared aside styles
    const asideClassName = (extra: string = '') =>
        `bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col ${extra}
        fixed left-0 top-0 lg:top-16 h-screen lg:h-[calc(100vh-4rem)]
        ${isMobile ? 'mobile-sidebar' : ''} ${isMobileOpen ? 'open' : ''}`;

    const asideStyle = {
        width: isMobile ? '85%' : `${sidebarWidth}px`,
        maxWidth: isMobile ? '320px' : 'none'
    };

    // Loading state
    if (loading) {
        return (
            <>
                <div className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`} onClick={() => setIsMobileOpen(false)} />
                <aside className={asideClassName('items-center justify-center text-gray-400')} style={asideStyle}>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zeno-cyan mb-2"></div>
                    <span className="text-xs">Loading...</span>
                </aside>
            </>
        );
    }

    // Error state
    if (error) {
        return (
            <>
                <div className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`} onClick={() => setIsMobileOpen(false)} />
                <aside className={asideClassName('items-center justify-center text-center p-4 text-red-500')} style={asideStyle}>
                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <p className="text-sm font-semibold">Failed to load projects</p>
                    <p className="text-xs mt-1 opacity-70">{error}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-3 py-1 bg-zeno-cyan text-zeno-navy rounded text-xs font-bold hover:bg-white transition-colors">
                        Retry
                    </button>
                </aside>
            </>
        );
    }

    // Main render
    return (
        <>
            <div className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`} onClick={() => setIsMobileOpen(false)} />

            <aside className={asideClassName('overflow-y-auto')} style={asideStyle}>
                {/* Mobile Header with Close Button */}
                {isMobile && (
                    <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                        <h2 className="text-lg font-bold text-white">Menu</h2>
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                <nav className="flex-1 p-4 space-y-6">
                    {/* Main Navigation */}
                    <SidebarNav
                        session={session}
                        casesUrl={process.env.NEXT_PUBLIC_CASES_URL ?? ''}
                        insuranceUrl={process.env.NEXT_PUBLIC_INSURANCE_URL ?? ''}
                        financeUrl={process.env.NEXT_PUBLIC_FINANCE_URL ?? ''}
                    />

                    {/* Projects Header with View Toggle */}
                    <div className="flex items-center justify-between px-2 mb-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {viewMode === 'TIME' ? 'Timeline' : 'Structure'}
                        </h3>
                        <button
                            onClick={() => setViewMode(viewMode === 'TIME' ? 'SOURCE' : 'TIME')}
                            className="text-[10px] text-zeno-cyan hover:text-white transition-colors border border-zeno-cyan/30 rounded px-1.5 py-0.5 bg-zeno-cyan/5"
                            title={viewMode === 'TIME' ? 'Switch to Source View' : 'Switch to Timeline View'}
                        >
                            {viewMode === 'TIME' ? 'Sort by Source' : 'Sort by Date'}
                        </button>
                    </div>

                    {/* Project Tree */}
                    {projectTree.length > 0 ? (
                        <ul className="space-y-1">
                            {projectTree.map((node) => (
                                <ProjectTreeItem
                                    key={node.id}
                                    project={node}
                                    autoExpandDate={viewMode === 'TIME' ? autoExpandDate : undefined}
                                />
                            ))}
                        </ul>
                    ) : (
                        <div className="text-xs text-gray-500 px-2 italic">No projects found.</div>
                    )}
                </nav>

                {/* User Profile Footer */}
                <UserProfileFooter session={session} />

                {/* Resize Handle */}
                <div
                    className="absolute top-0 right-0 w-1 h-full cursor-ew-resize bg-gray-700/20 hover:bg-gray-600/40 transition-colors group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                    style={{ right: -2, zIndex: 50 }}
                >
                    <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-gray-500/10" />
                </div>
            </aside>
        </>
    );
}
