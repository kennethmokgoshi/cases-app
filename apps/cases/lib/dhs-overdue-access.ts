import { prisma } from '@zenowethu/database';

export interface DhsOverdueSessionUser {
    id: string;
    isAdmin?: boolean | null;
    role?: string | null;
    b2bPartnerId?: string | null;
}

// Cycle-safe descendant expansion, mirroring the pattern used in /api/cases and
// the main dashboard page — a project (e.g. Shosholoza) grants access to itself
// and everything nested under it (years/months/branches/referrers).
function getDescendantIds(rootId: string, childrenMap: Map<string, string[]>): string[] {
    const descendants: string[] = [];
    const queue = [rootId];
    const seen = new Set<string>([rootId]);
    while (queue.length > 0) {
        const currId = queue.shift()!;
        const children = childrenMap.get(currId) || [];
        for (const childId of children) {
            if (!seen.has(childId)) {
                seen.add(childId);
                descendants.push(childId);
                queue.push(childId);
            }
        }
    }
    return descendants;
}

export function isDhsOverdueAdmin(user: DhsOverdueSessionUser): boolean {
    return user.isAdmin === true || user.role?.toUpperCase() === 'ADMIN';
}

/**
 * Builds the Prisma `Case` where-clause fragment that scopes DHS-overdue
 * queries to what the given user is allowed to see. Only Admins see every
 * project — everyone else (including STAFF) is restricted to the projects
 * they're a ProjectMember of (descendants included) plus their b2bPartnerId,
 * falling back to only their own created cases if they hold no project
 * membership at all.
 *
 * Shared by /api/dashboard/dhs-overdue (the count/list) and
 * /api/dhs/bulk-check-status (re-validates caseIds before acting on them).
 */
export async function getDhsOverdueAccessWhere(user: DhsOverdueSessionUser): Promise<Record<string, any>> {
    const isAdmin = isDhsOverdueAdmin(user);
    const where: Record<string, any> = {};
    if (!isAdmin) where.isAdminOnly = false;
    if (isAdmin) return where;

    const memberships = await prisma.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
    });
    const roots = memberships.map(m => m.projectId);
    if (user.b2bPartnerId && !roots.includes(user.b2bPartnerId)) {
        roots.push(user.b2bPartnerId);
    }

    if (roots.length === 0) {
        // No project access granted at all — fall back to only their own cases.
        where.createdById = user.id;
        return where;
    }

    const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    allProjects.forEach(p => {
        if (p.parentId) {
            const list = childrenMap.get(p.parentId) || [];
            list.push(p.id);
            childrenMap.set(p.parentId, list);
        }
    });

    const allowedSet = new Set<string>();
    roots.forEach(id => {
        allowedSet.add(id);
        getDescendantIds(id, childrenMap).forEach(d => allowedSet.add(d));
    });
    where.projects = { some: { projectId: { in: Array.from(allowedSet) } } };
    return where;
}
