// Pure selection logic for DestinationPathSelector (Move Cases modal).
// Kept free of React so it can be unit-tested.

export type DestinationProject = {
    id: string;
    name: string;
    type: string;
    clientType?: string | null;
    parentId?: string | null;
    children?: DestinationProject[];
};

// Project types that count as a selectable branch/subproject under a main
// source. YEAR/MONTH are structural date folders and are never offered.
export const SUBPROJECT_TYPES = ['BRANCH', 'FOLDER', 'REFERRER'] as const;

// Flattens the /api/projects response ({ hierarchy, independent }) into a
// single deduplicated list. The admin response nests children recursively
// (both under the ROOT hierarchy and under each independent top-level
// project); the member-scoped response returns every visible project as a
// flat row, with children nested one level deep WITHOUT parentId. Nested
// child rows therefore get parentId synthesized from the walk, and a later
// duplicate that carries a parentId upgrades an earlier row that lacked one.
export function flattenProjectResponse(
    hierarchy: DestinationProject | null | undefined,
    independent: DestinationProject[] | null | undefined
): DestinationProject[] {
    const flat: DestinationProject[] = [];
    const byId = new Map<string, DestinationProject>();

    const walk = (node: DestinationProject, parentIdFromWalk: string | null) => {
        const parentId = node.parentId ?? parentIdFromWalk;
        const existing = byId.get(node.id);
        if (!existing) {
            const entry = node.parentId === parentId ? node : { ...node, parentId };
            byId.set(node.id, entry);
            flat.push(entry);
        } else if (existing.parentId == null && parentId != null) {
            existing.parentId = parentId;
        }
        node.children?.forEach(c => walk(c, node.id));
    };

    if (hierarchy) walk(hierarchy, null);
    independent?.forEach(p => walk(p, null));

    return flat;
}

// Main sources for a given acquisition type. Strict match on B2B/B2C;
// unclassified (null) sources appear under both so they are never unreachable.
// Any other value (e.g. 'LEGACY') deliberately hides the source from pickers.
export function filterSourcesByClientType(
    sources: DestinationProject[],
    acquisitionType: 'B2B' | 'B2C'
): DestinationProject[] {
    return sources.filter(p => p.clientType === acquisitionType || !p.clientType);
}

// All descendants of parentId that are selectable subprojects, sorted by name.
export function getSubprojects(
    parentId: string,
    allProjects: DestinationProject[]
): DestinationProject[] {
    const result: DestinationProject[] = [];
    const queue = [parentId];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const pid = queue.shift()!;
        if (visited.has(pid)) continue;
        visited.add(pid);
        for (const p of allProjects) {
            if (p.parentId === pid && !visited.has(p.id)) {
                result.push(p);
                queue.push(p.id);
            }
        }
    }

    return result
        .filter(p => (SUBPROJECT_TYPES as readonly string[]).includes(p.type))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}
