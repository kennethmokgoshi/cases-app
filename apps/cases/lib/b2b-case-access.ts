import { prisma } from '@zenowethu/database';

type MentionCandidate = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    username: string;
    userType: string;
    emailNotificationsEnabled: boolean;
};

function getDescendantIds(rootId: string, childrenMap: Map<string, string[]>): string[] {
    const descendants: string[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
        const currId = queue.shift()!;
        const children = childrenMap.get(currId);
        if (children) {
            for (const childId of children) {
                descendants.push(childId);
                queue.push(childId);
            }
        }
    }
    return descendants;
}

/** A B2B partner's own project plus every descendant project (sub-branches of their org). */
export async function getB2BAllowedProjectIds(b2bPartnerId: string): Promise<string[]> {
    const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    for (const p of allProjects) {
        if (p.parentId) {
            const list = childrenMap.get(p.parentId);
            if (list) list.push(p.id);
            else childrenMap.set(p.parentId, [p.id]);
        }
    }
    return [b2bPartnerId, ...getDescendantIds(b2bPartnerId, childrenMap)];
}

/** Whether a case falls inside a B2B partner's own project hierarchy. */
export async function canB2BAccessCase(caseId: string, b2bPartnerId: string): Promise<boolean> {
    const allowedProjectIds = await getB2BAllowedProjectIds(b2bPartnerId);
    const match = await prisma.case.findFirst({
        where: { id: caseId, deletedAt: null, projects: { some: { projectId: { in: allowedProjectIds } } } },
        select: { id: true },
    });
    return !!match;
}

/**
 * Users a B2B partner may @mention on a given case: staff assigned/created the
 * case or belonging to a project the case is filed under, plus other users at
 * the partner's own organisation. Deliberately excludes the rest of the
 * userbase so a partner can't discover or notify unrelated staff/partners.
 */
export async function getMentionableUsersForB2B(caseId: string, b2bPartnerId: string): Promise<MentionCandidate[]> {
    const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            assignedToId: true,
            createdById: true,
            projects: { select: { project: { select: { members: { select: { userId: true } } } } } },
        },
    });
    if (!caseData) return [];

    const staffIds = new Set<string>();
    if (caseData.assignedToId) staffIds.add(caseData.assignedToId);
    if (caseData.createdById) staffIds.add(caseData.createdById);
    for (const cp of caseData.projects) {
        for (const member of cp.project.members) staffIds.add(member.userId);
    }

    const candidates = await prisma.user.findMany({
        where: {
            isLocked: false,
            OR: [
                { id: { in: Array.from(staffIds) } },
                { userType: 'B2B_PARTNER', b2bPartnerId },
            ],
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            userType: true,
            emailNotificationsEnabled: true,
        },
    });

    return candidates;
}
