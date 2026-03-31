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
export function buildTimeTree(projects: Project[]): ProjectNode[] {
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

            // ADAPTIVE LOGIC:
            // Case A: Hierarchy is Year -> Month -> (Children are content). 
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
                    vMonth.id = monthNodeRaw.id;
                }

                vMonth._count!.cases += (monthNodeRaw._count?.cases || 0);
                vYear._count!.cases += (monthNodeRaw._count?.cases || 0);

                return; // Done processing this Month node
            }

            // Case B: The old logic (Source -> Branch -> Year -> Month)
            const branchRaw = yearNodeRaw?.parentId ? allProjectsMap.get(yearNodeRaw.parentId) : null;
            const sourceRaw = branchRaw?.parentId ? allProjectsMap.get(branchRaw.parentId) : null;

            if (yearNodeRaw && branchRaw && sourceRaw) {
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
                    vMonth.id = monthNodeRaw.id;
                }
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
                    const monthNode = parent;
                    const yearNode = monthNode.parentId ? allProjectsMap.get(monthNode.parentId) : null;

                    if (yearNode && (yearNode.type === 'YEAR' || !isNaN(Number(yearNode.name)))) {
                        const effectiveMonthName = parentNormalizedMonth || monthNode.name;

                        // Get or Create Year
                        if (!yearMap.has(yearNode.name)) {
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
                            vMonth.id = monthNode.id;
                        }

                        const childNode: ProjectNode = {
                            id: p.id,
                            name: p.name,
                            type: 'V_BRANCH',
                            children: [],
                            _count: p._count
                        };

                        // Avoid duplicates
                        if (!vMonth.children?.some(c => c.id === childNode.id)) {
                            vMonth.children?.push(childNode);
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

    // Sort months
    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    roots.forEach(year => {
        year.children?.sort((a, b) => monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name));
        year.children?.forEach(month => {
            month.children?.sort((a, b) => a.name.localeCompare(b.name));
            month.children?.forEach(source => {
                source.children?.sort((a, b) => a.name.localeCompare(b.name));
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
