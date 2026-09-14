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

/**
 * What a user may do with a referrer:
 *   MANAGER — full edit (a MANAGER membership on the referrer's sub-project or
 *             any ancestor of it, e.g. a manager of "Letsatsi" manages every
 *             Letsatsi branch below it). Admins always get this.
 *   MEMBER  — view, plus filling in a blank email/cell number. Changing a
 *             contact detail that is already there counts as editing.
 *   NONE    — the referrer is invisible to this user.
 *
 * The role stored on each ProjectMember row decides — a user's global staff
 * title does not. The same person can be a MEMBER of one branch and a MANAGER
 * of another, under different parents.
 */
export type ReferrerAccessLevel = 'NONE' | 'MEMBER' | 'MANAGER';

/** Referrer fields a plain MEMBER may fill in. */
export const MEMBER_EDITABLE_REFERRER_FIELDS = ['email', 'cellNumber'] as const;

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
    const { viewable } = await getReferrerProjectAccess(userId);
    return Array.from(viewable);
}

/**
 * Both scopes from a single graph walk: every project whose referrers the user
 * may see, and the subset they may fully manage. A membership covers the
 * project it is on plus every descendant, so a MANAGER of a partner root
 * manages all of its branches while a MEMBER of one branch manages none.
 */
export async function getReferrerProjectAccess(
    userId: string
): Promise<{ viewable: Set<string>; manageable: Set<string> }> {
    const memberships = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true, role: true },
    });
    if (memberships.length === 0) {
        return { viewable: new Set<string>(), manageable: new Set<string>() };
    }

    const allProjects = await prisma.project.findMany({ select: { id: true, parentId: true } });
    const { childrenByParent } = buildChildIndex(allProjects);

    const memberIds = memberships.map((m) => m.projectId);
    const managerIds = memberships.filter((m) => m.role === 'MANAGER').map((m) => m.projectId);

    const viewable = new Set<string>(memberIds);
    addDescendants(memberIds, childrenByParent, viewable);

    const manageable = new Set<string>(managerIds);
    addDescendants(managerIds, childrenByParent, manageable);

    return { viewable, manageable };
}

/** What this user may do with the referrer that owns `referrerProjectId`. */
export async function getReferrerAccessLevel(
    user: SessionUserAccess,
    referrerProjectId: string | null
): Promise<ReferrerAccessLevel> {
    if (hasFullReferrerVisibility(user)) return 'MANAGER';
    if (!referrerProjectId) return 'NONE';
    const { viewable, manageable } = await getReferrerProjectAccess(user.id);
    if (manageable.has(referrerProjectId)) return 'MANAGER';
    if (viewable.has(referrerProjectId)) return 'MEMBER';
    return 'NONE';
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

/**
 * Prisma `where` fragment restricting a Referrer query to what this user may
 * see. Empty for admins; a `projectId` filter for everyone else. A non-admin
 * with no memberships gets `{ in: [] }`, which correctly matches nothing.
 */
export async function referrerVisibilityWhere(
    user: SessionUserAccess
): Promise<Record<string, unknown>> {
    if (hasFullReferrerVisibility(user)) return {};
    return { projectId: { in: await getVisibleReferrerProjectIds(user.id) } };
}

/**
 * The same restriction expressed for queries rooted on ReferrerCommission — a
 * commission (and its referrer's banking details) is visible only when the
 * referrer itself is.
 */
export async function commissionVisibilityWhere(
    user: SessionUserAccess
): Promise<Record<string, unknown>> {
    if (hasFullReferrerVisibility(user)) return {};
    return {
        referrer: { projectId: { in: await getVisibleReferrerProjectIds(user.id) } },
    };
}

/**
 * Guards a PATCH made by a plain MEMBER. They may only fill in a blank email or
 * cell number: touching any other field, clearing a value, or changing one that
 * is already set is editing, which is manager-only.
 *
 * Returns the message to show the member, or null when the patch is allowed.
 */
export function checkMemberContactUpdate(
    patch: Record<string, unknown>,
    existing: { email: string | null; cellNumber: string | null }
): string | null {
    const allowed = MEMBER_EDITABLE_REFERRER_FIELDS as readonly string[];
    const disallowed = Object.keys(patch).filter((key) => !allowed.includes(key));
    if (disallowed.length > 0) {
        return `You can only add an email address or cell number to this referrer. Ask a manager of this project to change: ${disallowed.join(', ')}.`;
    }

    for (const field of MEMBER_EDITABLE_REFERRER_FIELDS) {
        if (!(field in patch)) continue;
        const next = patch[field];
        if (next === null || next === '') {
            return 'You cannot clear a referrer contact detail — ask a manager of this project.';
        }
        const current = existing[field];
        if (current && current !== next) {
            const label = field === 'email' ? 'an email address' : 'a cell number';
            return `This referrer already has ${label}. Changing it is an edit — ask a manager of this project.`;
        }
    }

    return null;
}
