'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { NotificationBell } from '../NotificationBell';
import { SearchWithSuggestions } from '../ui/SearchWithSuggestions';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { useLayout } from '../providers/layout-context';
import { logger } from '@zenowethu/shared-lib';

type Project = {
    id: string;
    name: string;
    type: string;
    children?: Project[];
    _count?: { cases: number };
    parentId?: string | null;
};

type ProjectNode = Project & {
    children?: ProjectNode[];
    level?: number;
};

// Helper to build tree from flat list (Original Source -> Branch -> Year -> Month)
function buildSourceTree(projects: Project[]): ProjectNode[] {
    const projectMap = new Map<string, ProjectNode>();
    const roots: ProjectNode[] = [];

    // 1. Initialize map
    projects.forEach(p => {
        projectMap.set(p.id, { ...p, children: [], level: 0 });
    });

    // 2. Build relationships
    projects.forEach(p => {
        const node = projectMap.get(p.id)!;
        if ((p as any).parentId && projectMap.has((p as any).parentId)) {
            const parent = projectMap.get((p as any).parentId)!;
            parent.children?.push(node);
        } else {
            roots.push(node);
        }
    });

    // 3. Sort by name
    const sortNodes = (nodes: ProjectNode[]) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        nodes.forEach(n => {
            if (n.children && n.children.length > 0) sortNodes(n.children);
        });
    };
    sortNodes(roots);
    return roots;
}

// Helper to build Time-based tree (Year -> Month -> Source -> Branch)
function buildTimeTree(projects: Project[]): ProjectNode[] {
    const allProjectsMap = new Map<string, Project>(projects.map(p => [p.id, p]));
    const yearMap = new Map<string, ProjectNode>(); // Year Name -> Virtual Node

    // We iterate over LEAF nodes (Months) which contain the actual cases
    // DB Path: Source -> Branch -> Year -> Month (Leaf)
    // Target Path: Year -> Month -> Source -> Branch (Leaf pointer)

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Helper to normalize month name
    const getNormalizedMonthName = (name: string) => {
        const index = monthNames.findIndex(m => m.toLowerCase() === name.toLowerCase());
        if (index !== -1) return monthNames[index];
        const shortIndex = shortMonthNames.findIndex(m => m.toLowerCase() === name.toLowerCase());
        if (shortIndex !== -1) return monthNames[shortIndex];
        return null;
    };

    projects.forEach(p => {
        // 0. Ensure explicit YEAR projects validly appear even if empty
        if (p.type === 'YEAR') {
            if (!yearMap.has(p.name)) {
                yearMap.set(p.name, {
                    id: `V-YEAR-${p.name}`,
                    name: p.name,
                    type: 'V_YEAR',
                    children: [],
                    _count: { cases: p._count?.cases || 0 }
                });
            } else {
                // If already created, ensure we account for its own direct cases if any
                const existing = yearMap.get(p.name)!;
                if ((p._count?.cases || 0) > 0) {
                    existing._count!.cases += (p._count?.cases || 0);
                }
            }
        }

        // Logic to detect if this is a "Month" project
        // It is a month if:
        // 1. Type is MONTH
        // 2. OR Type is FOLDER/null AND name is a valid Month Name
        const normalizedMonthName = getNormalizedMonthName(p.name);
        const isMonth = p.type === 'MONTH' || normalizedMonthName !== null;

        if (isMonth) {
            const effectiveMonthName = normalizedMonthName || p.name;

            // Traverse up to find the full path
            const monthNodeRaw = p;
            const yearNodeRaw = monthNodeRaw.parentId ? allProjectsMap.get(monthNodeRaw.parentId) : null;
            // Branch/Source logic might differ if the structure is flattened (Year -> Month -> Source)
            // User says structure is: Year -> Month -> Sources (10, 17, 24)
            // So 'monthNodeRaw' IS the Month. 'yearNodeRaw' IS the Year.
            // But existing logic assumes: Source -> Branch -> Year -> Month.

            // ADAPTIVE LOGIC:
            // Case A: Hierarchy is Year -> Month -> (Children are content). 
            // In this case, 'yearNodeRaw' exists and is a YEAR.
            // We should put this Month under that Year.
            if (yearNodeRaw && (yearNodeRaw.type === 'YEAR' || !isNaN(Number(yearNodeRaw.name)))) {

                // 1. Ensure Virtual Year Node
                if (!yearMap.has(yearNodeRaw.name)) {
                    yearMap.set(yearNodeRaw.name, {
                        id: `V-YEAR-${yearNodeRaw.name}`,
                        name: yearNodeRaw.name,
                        type: 'V_YEAR',
                        children: [],
                        _count: { cases: 0 }
                    });
                }
                const vYear = yearMap.get(yearNodeRaw.name)!;

                // 2. Ensure Virtual Month Node under Year
                let vMonth = vYear.children?.find(c => c.name === effectiveMonthName);
                if (!vMonth) {
                    vMonth = {
                        id: monthNodeRaw.id, // Use REAL ID for querying cases
                        name: effectiveMonthName,
                        type: 'V_MONTH',
                        children: [],
                        _count: { cases: 0 }
                    };
                    vYear.children?.push(vMonth);
                } else if (vMonth.id.startsWith('V-MONTH-')) {
                    // Update existing virtual placeholder with real ID if we found the real project
                    vMonth.id = monthNodeRaw.id;
                }

                // 3. For the user's specific case: Year -> Month -> Source (10, 17, 24)
                // The children of this Month project are the Sources.
                // We want to list these children under the Month in the timeline.
                // But `projects` list handles each node. 
                // Currently, we are at the Month Node.
                // If we stop here, the timeline shows Year -> Month.
                // The user wants Year -> Month -> Source.
                // So we need to find the children of THIS month node and add them.
                // BUT, filtering `projects` to find children is O(N^2) effectively if naive.
                // Better: Iterate all projects, if a project has a parent that is a Month, add it.
                // Wait, the current loop iterates ALL projects.
                // So when we hit "10" (whose parent is "Feb"), we should handle it.

                // Let's modify the loop to handle "Child of Month".

                // For NOW, let's just register this Month node so the Year -> Month structure exists.
                // We add a 'Virtual Branch' pointing to the Month itself so user can click it?
                // Or do we rely on the Child Iteration?

                // If we only register the Month here, it shows up. 
                // We also need to add its case count.
                vMonth._count!.cases += (monthNodeRaw._count?.cases || 0);
                vYear._count!.cases += (monthNodeRaw._count?.cases || 0);

                return; // Done processing this Month node
            }

            // Case B: The old logic (Source -> Branch -> Year -> Month)
            // We keep the old logic for fallback if the structure matches that standard.
            const branchRaw = yearNodeRaw?.parentId ? allProjectsMap.get(yearNodeRaw.parentId) : null;
            const sourceRaw = branchRaw?.parentId ? allProjectsMap.get(branchRaw.parentId) : null;

            if (yearNodeRaw && branchRaw && sourceRaw) {
                // ... (Original logic for deep nesting) ...
                // 1. Ensure Virtual Year Node
                if (!yearMap.has(yearNodeRaw.name)) {
                    yearMap.set(yearNodeRaw.name, {
                        id: `V-YEAR-${yearNodeRaw.name}`,
                        name: yearNodeRaw.name,
                        type: 'V_YEAR',
                        children: [],
                        _count: { cases: 0 }
                    });
                }
                const vYear = yearMap.get(yearNodeRaw.name)!;

                // 2. Ensure Virtual Month Node under Year
                let vMonth = vYear.children?.find(c => c.name === effectiveMonthName);
                if (!vMonth) {
                    vMonth = {
                        id: monthNodeRaw.id, // Use REAL ID
                        name: effectiveMonthName,
                        type: 'V_MONTH',
                        children: [],
                        _count: { cases: 0 }
                    };
                    vYear.children?.push(vMonth);
                } else if (vMonth.id.startsWith('V-MONTH-')) {
                    // Update existing with real ID
                    vMonth.id = monthNodeRaw.id;
                }
                // ... rest of old logic ...
            }
        }
    });

    // SECOND PASS: Handle "Children of Months" (e.g. 10, 17, 24 under Feb)
    projects.forEach(p => {
        if (p.parentId) {
            const parent = allProjectsMap.get(p.parentId);
            if (parent) {
                const parentNormalizedMonth = getNormalizedMonthName(parent.name);
                const parentIsMonth = parent.type === 'MONTH' || parentNormalizedMonth !== null;

                if (parentIsMonth) {
                    // This 'p' (e.g. "10") is a child of a Month ("Feb").
                    // We want it to appear as Year -> Month -> Child ("10")

                    const monthNode = parent;
                    const yearNode = monthNode.parentId ? allProjectsMap.get(monthNode.parentId) : null;

                    if (yearNode && (yearNode.type === 'YEAR' || !isNaN(Number(yearNode.name)))) {
                        const effectiveMonthName = parentNormalizedMonth || monthNode.name;

                        // Get or Create Year
                        if (!yearMap.has(yearNode.name)) {
                            // Should exist from Pass 1 usually, but safekeeping
                            yearMap.set(yearNode.name, {
                                id: `V-YEAR-${yearNode.name}`,
                                name: yearNode.name,
                                type: 'V_YEAR',
                                children: [],
                                _count: { cases: 0 }
                            });
                        }
                        const vYear = yearMap.get(yearNode.name)!;

                        // Get or Create Month
                        let vMonth = vYear.children?.find(c => c.name === effectiveMonthName);
                        if (!vMonth) {
                            vMonth = {
                                id: monthNode.id, // Use REAL ID
                                name: effectiveMonthName,
                                type: 'V_MONTH',
                                children: [],
                                _count: { cases: 0 }
                            };
                            vYear.children?.push(vMonth);
                        } else if (vMonth.id.startsWith('V-MONTH-')) {
                            // Update existing with real ID
                            vMonth.id = monthNode.id;
                        }

                        // Add this Child as a generic Item under Month
                        // We'll call it V_BRANCH to reuse existing rendering logic or V_SOURCE
                        // The user said: "Main Source which is 10 or 17". So let's use V_SOURCE semantics if possible?
                        // But rendering uses V_BRANCH as leaf.
                        // Let's check ProjectTreeItem logic.
                        // It renders link based on ID.

                        // We create a node that links directly to this project ID
                        const childNode: ProjectNode = {
                            id: p.id,
                            name: p.name,
                            type: 'V_BRANCH', // Treat as leaf link
                            children: [],
                            _count: p._count
                        };

                        // Avoid duplicates
                        if (!vMonth.children?.some(c => c.id === childNode.id)) {
                            vMonth.children?.push(childNode);

                            // Aggregate counts
                            vMonth._count!.cases += (p._count?.cases || 0);
                            vYear._count!.cases += (p._count?.cases || 0);
                        }
                    }
                }
            }
        }
    });

    // Convert map to array and sort
    const roots = Array.from(yearMap.values());

    // Sort Years descending (newest first)
    roots.sort((a, b) => b.name.localeCompare(a.name));

    // Sort months? 
    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    roots.forEach(year => {
        year.children?.sort((a, b) => monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name));
        year.children?.forEach(month => {
            month.children?.sort((a, b) => a.name.localeCompare(b.name)); // Sort Sources A-Z
            month.children?.forEach(source => {
                source.children?.sort((a, b) => a.name.localeCompare(b.name)); // Sort Branches A-Z
            });
        });
    });



    // Group all Time roots under "My Cases" if available
    const myCasesProject = projects.find(p => p.name === 'My Cases');
    if (myCasesProject) {
        return [{
            id: myCasesProject.id,
            name: myCasesProject.name,
            type: myCasesProject.type || 'FOLDER',
            children: roots,
            _count: myCasesProject._count || { cases: 0 }
        }];
    }

    return roots;
}

// Helper to calculate total cases recursively

const calculateTotalCases = (project: ProjectNode): number => {
    // Override if provided (for My Cases root)
    if (typeof (project as any)._overrideTotal === 'number') {
        return (project as any)._overrideTotal;
    }

    // For Virtual nodes, we already aggregated. For normal nodes, we might need to sum.
    if (project.type && project.type.startsWith('V_')) return project._count?.cases || 0;

    let total = project._count?.cases || 0;
    if (project.children) {
        for (const child of project.children) {
            total += calculateTotalCases(child);
        }
    }
    return total;
};

const ProjectTreeItem = ({ project, depth = 0, autoExpandDate, yearContext }: { project: ProjectNode; depth?: number; autoExpandDate?: { year: string, month: string }, yearContext?: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const projectIdParam = searchParams.get('projectId');
    const activeProjectId = projectIdParam;

    const hasChildren = project.children && project.children.length > 0;
    const paddingLeft = depth * 12 + 12; // indentation
    const totalCases = project.type && project.type.startsWith('V_') ? project._count?.cases || 0 : calculateTotalCases(project);

    // Auto-expand logic
    useEffect(() => {
        if (autoExpandDate) {
            // Expand Year if matches
            if (project.type === 'V_YEAR' && project.name === autoExpandDate.year) {
                setIsOpen(true);
            }
            // Expand Month if matches and parent (implied by rendering) matches
            // We can just match name because months are unique children of years
            if (project.type === 'V_MONTH' && project.name === autoExpandDate.month) {
                setIsOpen(true);
            }
        }
    }, [autoExpandDate, project]);

    return (
        <li>
            <div
                className={`flex items-center justify-between py-2 pr-3 rounded-lg transition-colors group ${activeProjectId === project.id ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                style={{ paddingLeft: `${paddingLeft}px` }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {hasChildren ? (
                        <>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsOpen(!isOpen);
                                }}
                                className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                            >
                                <svg
                                    className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {/* Render different logic depending on if it's a virtual parent node */}
                            {(() => {
                                let href = '#';
                                if (project.type === 'V_YEAR') {
                                    href = `/cases?year=${encodeURIComponent(project.name)}`;
                                } else if (project.type === 'V_MONTH') {
                                    // Use explicit yearContext if available
                                    if (yearContext) {
                                        href = `/cases?year=${encodeURIComponent(yearContext)}&month=${encodeURIComponent(project.name)}`;
                                    } else {
                                        const parts = project.id.split('-');
                                        // Id format: V-MONTH-YEAR-MONTHNAME
                                        if (parts.length >= 4) {
                                            const year = parts[2];
                                            href = `/cases?year=${year}&month=${encodeURIComponent(project.name)}`;
                                        } else {
                                            // Fallback if no context and weird ID (shouldn't happen in Time view)
                                            href = `/cases?projectId=${project.id}`;
                                        }
                                    }
                                } else if (project.type === 'V_SOURCE') {
                                    // Id format: V-SOURCE-YEAR-MONTH-SOURCE
                                    const parts = project.id.split('-');
                                    if (parts.length >= 5) {
                                        const year = parts[2];
                                        const month = parts[3];
                                        href = `/cases?year=${year}&month=${month}&source=${encodeURIComponent(project.name)}`;
                                    }
                                } else {
                                    // Fallback / Source View
                                    href = `/cases?projectId=${project.id}`;
                                }

                                return (
                                    <Link
                                        href={href}
                                        className="truncate flex-1 hover:text-white transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {project.name}
                                    </Link>
                                );
                            })()}
                        </>
                    ) : (
                        <>
                            <div className="w-4" />
                            {(() => {
                                let href = '#';
                                if (project.type === 'V_MONTH') {
                                    if (yearContext) {
                                        href = `/cases?year=${encodeURIComponent(yearContext)}&month=${encodeURIComponent(project.name)}`;
                                    } else {
                                        href = `/cases?projectId=${project.id}`;
                                    }
                                } else {
                                    href = `/cases?projectId=${project.id}`;
                                }
                                return (
                                    <Link
                                        href={href}
                                        className="truncate flex-1"
                                    >
                                        {project.name}
                                    </Link>
                                )
                            })()}
                        </>
                    )}
                </div>
                {totalCases > 0 ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${activeProjectId === project.id ? 'bg-zeno-cyan/20 text-zeno-cyan' : 'bg-zeno-blue text-gray-300 group-hover:bg-zeno-cyan/20 group-hover:text-zeno-cyan'}`}>
                        {totalCases}
                    </span>
                ) : null}
            </div>
            {hasChildren && isOpen && (
                <ul className="space-y-0.5 mt-0.5 border-l border-white/5 ml-3">
                    {project.children!.map(child => (
                        <ProjectTreeItem
                            key={child.id}
                            project={child}
                            depth={0}
                            autoExpandDate={autoExpandDate}
                            yearContext={project.type === 'V_YEAR' ? project.name : yearContext}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

export function Sidebar() {
    const { data: session } = useSession();
    const router = useRouter();
    const [projectTree, setProjectTree] = useState<ProjectNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pathname = usePathname();
    const [viewMode, setViewMode] = useState<'SOURCE' | 'TIME'>('TIME'); // Default to TIME as requested

    // Auto-expand targets
    const currentYear = new Date().getFullYear().toString();
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const autoExpandDate = { year: currentYear, month: currentMonth };

    // Mobile menu state from context
    const { isMobileOpen, setIsMobileOpen, toggleMobileMenu } = useLayout();
    const [isMobile, setIsMobile] = useState(false);

    // Resizable sidebar state
    const [sidebarWidth, setSidebarWidth] = useState(320); // Default 320px (w-80)
    const [isResizing, setIsResizing] = useState(false);

    // Check if mobile and load saved width
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            // Close mobile menu when switching to desktop
            if (!mobile) setIsMobileOpen(false);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Load saved width
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
            // Min width: 256px (w-64), Max width: 480px (w-120)
            const clampedWidth = Math.min(Math.max(newWidth, 256), 480);
            setSidebarWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                // Save to localStorage
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
        // Only apply actual margin on desktop
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

    // Toggle mobile menu function (exposed for TopBar) - REMOVED, using context

    useEffect(() => {
        async function fetchProjects() {
            try {
                // Fetch stats for accurate total count
                let totalCasesOverride = 0;
                try {
                    const statsRes = await fetch('/api/dashboard/stats');
                    if (statsRes.ok) {
                        const stats = await statsRes.json();
                        totalCasesOverride = stats.totalActiveCases || stats.totalCases || 0;
                    }
                } catch (e) {
                    logger.error('Failed to fetch stats', e);
                }

                // Always fetch FLAT list to allow client-side transformation
                const res = await fetch('/api/projects?flat=true&all=true');
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`API Error ${res.status}: ${text.substring(0, 100)}...`);
                }
                const data = await res.json(); // Array of all projects

                if (Array.isArray(data)) {
                    let tree: ProjectNode[] = [];
                    if (viewMode === 'TIME') {
                        tree = buildTimeTree(data);
                    } else {
                        tree = buildSourceTree(data);
                    }

                    // Filter out projects with 0 cases (recursively)
                    const filterTree = (nodes: ProjectNode[]): ProjectNode[] => {
                        return nodes.filter(node => {
                            // 1. Filter children first
                            if (node.children && node.children.length > 0) {
                                node.children = filterTree(node.children);
                            }

                            // 2. Check if this node should be kept
                            // Keep if it has direct cases OR has remaining children
                            // We use the existing calculateTotalCases helper which sums up recursively
                            const total = calculateTotalCases(node);
                            return total > 0;
                        });
                    };

                    tree = filterTree(tree);

                    // Override "My Cases" count if we have stats
                    if (totalCasesOverride > 0) {
                        const myCases = tree.find(n => n.name === 'My Cases');
                        if (myCases) {
                            (myCases as any)._overrideTotal = totalCasesOverride;
                        }
                    }

                    setProjectTree(tree);

                } else {
                    // Fallback check if API returned wrapped object (should not happen with flat=true)
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

    if (loading) {
        return (
            <>
                {/* Mobile Hamburger Button - MOVED TO TOPBAR */}

                {/* Mobile Overlay */}
                <div
                    className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`}
                    onClick={() => setIsMobileOpen(false)}
                />

                <aside
                    className={`bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col items-center justify-center text-gray-400
                        fixed top-0 lg:top-16 h-screen lg:h-[calc(100vh-4rem)]
                        ${isMobile ? 'mobile-sidebar' : ''} ${isMobileOpen ? 'open' : ''}`}
                    style={{ width: isMobile ? '85%' : `${sidebarWidth}px`, maxWidth: isMobile ? '320px' : 'none' }}
                >
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zeno-cyan mb-2"></div>
                    <span className="text-xs">Loading...</span>
                </aside>
            </>
        );
    }

    if (error) return (
        <>
            {/* Mobile Hamburger Button - MOVED TO TOPBAR */}

            {/* Mobile Overlay */}
            <div
                className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
            />

            <aside
                className={`bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col items-center justify-center text-center p-4 text-red-500
                    fixed top-0 lg:top-16 h-screen lg:h-[calc(100vh-4rem)]
                    ${isMobile ? 'mobile-sidebar' : ''} ${isMobileOpen ? 'open' : ''}`}
                style={{ width: isMobile ? '85%' : `${sidebarWidth}px`, maxWidth: isMobile ? '320px' : 'none' }}
            >
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <p className="text-sm font-semibold">Failed to load projects</p>
                <p className="text-xs mt-1 opacity-70">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-3 py-1 bg-zeno-cyan text-zeno-navy rounded text-xs font-bold hover:bg-white transition-colors">
                    Retry
                </button>
            </aside>
        </>
    );

    return (
        <>
            {/* Mobile Hamburger Button - MOVED TO TOPBAR */}

            {/* Mobile Overlay */}
            <div
                className={`mobile-overlay lg:hidden ${isMobileOpen ? 'active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
            />

            <aside
                className={`bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] flex flex-col overflow-y-auto
                    fixed left-0 top-0 lg:top-16 h-screen lg:h-[calc(100vh-4rem)]
                    ${isMobile ? 'mobile-sidebar' : ''} ${isMobileOpen ? 'open' : ''}`}
                style={{ width: isMobile ? '85%' : `${sidebarWidth}px`, maxWidth: isMobile ? '320px' : 'none' }}
            >
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
                {/* Header removed - moved to TopBar */}

                <nav className="flex-1 p-4 space-y-6">
                    {/* Global Search Removed - Moved to TopBar */}

                    {/* Main Navigation */}
                    <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Menu</h3>
                        <ul className="space-y-1">
                            <li>
                                <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/' ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link href="/cases" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/cases') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    All Cases
                                </Link>
                            </li>
                            <li>
                                <Link href="/projects" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/projects') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    Projects
                                </Link>
                            </li>
                            <li>
                                <Link href="/resources" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/resources') ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.141.021l6.267 6.366a1 1 0 01.021.141V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Documents
                                </Link>
                            </li>
                            {(session?.user?.isAdmin || session?.user?.email === 'kenneth@zenowethu.co.za' || session?.user?.email === 'Kenneth@zenowethu.co.za') && (
                                <>
                                    <li className="mt-4 mb-2 px-2">
                                        <div className="h-px bg-white/5"></div>
                                        <h3 className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</h3>
                                    </li>
                                    <li>
                                        <Link href="/admin" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/admin' ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                            </svg>
                                            Dashboard
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/admin/partners" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/partners') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                            Partners
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/admin/users" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/users') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                            </svg>
                                            Users
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/compliance" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/compliance') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                            </svg>
                                            Compliance
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/admin/rate-tables" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/admin/rate-tables') ? 'bg-zeno-orange/10 text-zeno-orange' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                            </svg>
                                            Rate Tables
                                        </Link>
                                    </li>
                                </>
                            )}

                            {(session?.user?.isAdmin || (session?.user as any)?.role === 'ACCOUNTS' || (session?.user as any)?.role === 'FINANCE') && (
                                <>
                                    <li className="mt-4 mb-2 px-2">
                                        <div className="h-px bg-white/5"></div>
                                        <h3 className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Finance</h3>
                                    </li>
                                    <li>
                                        <Link href="/accounts" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/accounts' || pathname === '/accounts/dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Payments
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/accounts/import" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/accounts/import') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            Import Excel
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/invoices" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/invoices') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Invoices
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/revenue" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/revenue') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                            Revenue
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/credit-accounts" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/credit-accounts') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                            </svg>
                                            Credit Accounts
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/insurance-assessments" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/insurance-assessments') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            Insurance
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/legal-matters" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/legal-matters') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                            </svg>
                                            Legal Matters
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/forensic-audits" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/forensic-audits') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            Forensic Audits
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/audit-trail" className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname.startsWith('/audit-trail') ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            Audit Trail
                                        </Link>
                                    </li>
                                </>
                            )}
                        </ul>
                    </div>

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

                    {/* PROJECT TREE */}
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

                <div className="p-4 border-t border-zeno-blue/50">
                    <Link href="/account" className="flex items-center gap-3 px-2 py-2 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zeno-cyan to-blue-600 flex items-center justify-center text-white font-bold text-xs overflow-hidden shadow-lg shadow-black/20">
                            {session?.user?.avatarUrl ? (
                                <img src={session?.user?.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <span>{session?.user?.firstName?.[0]}{session?.user?.lastName?.[0]}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate group-hover:text-zeno-cyan transition-colors">
                                {session?.user?.firstName} {session?.user?.lastName}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate uppercase tracking-wider">
                                {session?.user?.organization || 'Zenowethu'}
                                {session?.user?.isAdmin ? (
                                    <span className="ml-1 text-zeno-orange font-bold">• Admin</span>
                                ) : session?.user?.isManager ? (
                                    <span className="ml-1 text-purple-400 font-bold">• Manager</span>
                                ) : (
                                    <span className="ml-1 text-zeno-cyan font-bold">• Member</span>
                                )}
                            </p>
                        </div>
                        <svg className="w-4 h-4 text-gray-600 group-hover:text-zeno-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="mt-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                    </button>
                </div>

                {/* Resize Handle */}
                <div
                    className="absolute top-0 right-0 w-1 h-full cursor-ew-resize bg-gray-700/20 hover:bg-gray-600/40 transition-colors group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                    style={{
                        right: -2,
                        zIndex: 50
                    }}
                >
                    <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-gray-500/10" />
                </div>
            </aside>
        </>
    );
}
