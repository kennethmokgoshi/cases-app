import type { Project, ProjectNode } from './sidebar-types';

// Helper to build tree from flat list (Original Source -> Branch -> Year -> Month)
export function buildSourceTree(projects: Project[]): ProjectNode[] {
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
export function buildTimeTree(projects: Project[], timelineStats?: Record<string, { total: number; months: Record<string, number> }>): ProjectNode[] {
    const allProjectsMap = new Map<string, Project>(projects.map(p => [p.id, p]));
    const yearMap = new Map<string, ProjectNode>(); // Year Name -> Virtual Node

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // 1. If we have timeline stats, seed the yearMap with them
    if (timelineStats) {
        Object.entries(timelineStats).forEach(([year, stats]) => {
            const vYear: ProjectNode = {
                id: `V-YEAR-${year}`,
                name: year,
                type: 'V_YEAR',
                children: [],
                _count: { cases: stats.total }
            };

            Object.entries(stats.months).forEach(([month, count]) => {
                vYear.children?.push({
                    id: `V-MONTH-${year}-${month}`, // Temporary ID, will be replaced if project found
                    name: month,
                    type: 'V_MONTH',
                    children: [],
                    _count: { cases: count }
                });
            });

            yearMap.set(year, vYear);
        });
    }

    // 2. Overlay project data (to get REAL IDs for navigation where possible)
    projects.forEach(p => {
        const getNormalizedMonthName = (name: string) => {
            const index = monthNames.findIndex(m => m.toLowerCase() === name.toLowerCase());
            if (index !== -1) return monthNames[index];
            const shortIndex = shortMonthNames.findIndex(m => m.toLowerCase() === name.toLowerCase());
            if (shortIndex !== -1) return monthNames[shortIndex];
            return null;
        };

        if (p.type === 'YEAR') {
            if (!yearMap.has(p.name)) {
                yearMap.set(p.name, {
                    id: `V-YEAR-${p.name}`,
                    name: p.name,
                    type: 'V_YEAR',
                    children: [],
                    _count: { cases: p._count?.cases || 0 }
                });
            }
        }

        const normalizedMonthName = getNormalizedMonthName(p.name);
        const isMonth = p.type === 'MONTH' || normalizedMonthName !== null;

        if (isMonth) {
            const effectiveMonthName = normalizedMonthName || p.name;
            const monthNodeRaw = p;
            const yearNodeRaw = monthNodeRaw.parentId ? allProjectsMap.get(monthNodeRaw.parentId) : null;

            if (yearNodeRaw && (yearNodeRaw.type === 'YEAR' || !isNaN(Number(yearNodeRaw.name)))) {
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

                let vMonth = vYear.children?.find(c => c.name === effectiveMonthName);
                if (!vMonth) {
                    vMonth = {
                        id: monthNodeRaw.id,
                        name: effectiveMonthName,
                        type: 'V_MONTH',
                        children: [],
                        _count: { cases: timelineStats ? 0 : (monthNodeRaw._count?.cases || 0) }
                    };
                    vYear.children?.push(vMonth);
                } else {
                    // Update to REAL ID
                    vMonth.id = monthNodeRaw.id;
                    // If no timeline stats, update count from project
                    if (!timelineStats) {
                        vMonth._count!.cases += (monthNodeRaw._count?.cases || 0);
                        vYear._count!.cases += (monthNodeRaw._count?.cases || 0);
                    }
                }
            }
        }
    });

    // 3. Convert map to array and sort
    const roots = Array.from(yearMap.values());
    roots.sort((a, b) => b.name.localeCompare(a.name));

    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    roots.forEach(year => {
        year.children?.sort((a, b) => monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name));
    });

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
export const calculateTotalCases = (project: ProjectNode): number => {
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
