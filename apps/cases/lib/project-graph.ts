// Pure helpers for walking the project hierarchy without N+1 / O(n²) work.
// Extracted from app/api/projects/route.ts so they can be unit-tested without a DB.

export type RawProject = { id: string; parentId: string | null; type?: string | null };

/** Build O(1) lookup indexes from a flat list of all projects. */
export function buildChildIndex(all: RawProject[]) {
    const byId = new Map<string, RawProject>();
    const childrenByParent = new Map<string, string[]>();
    for (const p of all) {
        byId.set(p.id, p);
        if (p.parentId) {
            const arr = childrenByParent.get(p.parentId);
            if (arr) arr.push(p.id);
            else childrenByParent.set(p.parentId, [p.id]);
        }
    }
    return { byId, childrenByParent };
}

/** Add every ancestor (walking up via parentId) of rootIds into `into`. */
export function addAncestors(rootIds: string[], byId: Map<string, RawProject>, into: Set<string>) {
    const queue = [...rootIds];
    while (queue.length > 0) {
        const node = byId.get(queue.shift()!);
        if (node?.parentId && !into.has(node.parentId)) {
            into.add(node.parentId);
            queue.push(node.parentId);
        }
    }
}

/** Add every descendant (walking down via the child index) of rootIds into `into`. */
export function addDescendants(rootIds: string[], childrenByParent: Map<string, string[]>, into: Set<string>) {
    const queue = [...rootIds];
    while (queue.length > 0) {
        const children = childrenByParent.get(queue.shift()!);
        if (!children) continue;
        for (const childId of children) {
            if (!into.has(childId)) {
                into.add(childId);
                queue.push(childId);
            }
        }
    }
}
