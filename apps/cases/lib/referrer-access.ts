// Referrer visibility rules.
//
// Every referrer has a linked sub-project (Project.type = 'REFERRER'). Staff
// membership of that sub-project (ProjectMember) is what grants access to the
// referrer in the admin registry:
//   - Admins see every referrer.
//   - Everyone else sees only referrers whose sub-project they are a member
//     of — including referrers nested under a project they belong to, which
//     matches how the sidebar project tree expands memberships to descendants.

import { prisma } from '@zenowethu/database';
import { buildChildIndex, addDescendants } from './project-graph';

export type SessionUserAccess = {
    id: string;
    isAdmin?: boolean;
};

/** Admins bypass membership filtering entirely. */
export function hasFullReferrerVisibility(user: SessionUserAccess): boolean {
    return !!user.isAdmin;
}

/**
 * All project IDs whose referrers this user may see: direct memberships plus
 * every descendant project (a member of a parent referrer's project also sees
 * the referrers nested under it).
 */
export async function getVisibleReferrerProjectIds(userId: string): Promise<string[]> {
    const memberships = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
    });
    const memberIds = memberships.map((m) => m.projectId);
    if (memberIds.length === 0) return [];

    const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });
    const { childrenByParent } = buildChildIndex(allProjects);
    const visible = new Set<string>(memberIds);
    addDescendants(memberIds, childrenByParent, visible);
    return Array.from(visible);
}

/**
 * Whether the user may view the referrer that owns `referrerProjectId`.
 * A referrer without a linked project is only visible to admins.
 */
export async function canAccessReferrer(
    user: SessionUserAccess,
    referrerProjectId: string | null
): Promise<boolean> {
    if (hasFullReferrerVisibility(user)) return true;
    if (!referrerProjectId) return false;
    const visible = await getVisibleReferrerProjectIds(user.id);
    return visible.includes(referrerProjectId);
}
