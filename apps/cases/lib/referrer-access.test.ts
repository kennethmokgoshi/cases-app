import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        projectMember: { findMany: vi.fn() },
        project: { findMany: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import {
    hasFullReferrerVisibility,
    getVisibleReferrerProjectIds,
    canAccessReferrer,
} from './referrer-access';

// Tree: referrals-root → proj-a → proj-a-child ; referrals-root → proj-b
const allProjects = [
    { id: 'referrals-root', parentId: null },
    { id: 'proj-a', parentId: 'referrals-root' },
    { id: 'proj-a-child', parentId: 'proj-a' },
    { id: 'proj-b', parentId: 'referrals-root' },
];

describe('hasFullReferrerVisibility', () => {
    it('is true only for admins', () => {
        expect(hasFullReferrerVisibility({ id: 'u1', isAdmin: true })).toBe(true);
        expect(hasFullReferrerVisibility({ id: 'u2', isAdmin: false })).toBe(false);
        expect(hasFullReferrerVisibility({ id: 'u3' })).toBe(false);
    });
});

describe('getVisibleReferrerProjectIds', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns empty array when user has no memberships', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        const ids = await getVisibleReferrerProjectIds('u1');
        expect(ids).toEqual([]);
        expect(vi.mocked(prisma.project.findMany)).not.toHaveBeenCalled();
    });

    it('includes direct memberships and their descendants', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
        const ids = await getVisibleReferrerProjectIds('u1');
        expect(ids).toContain('proj-a');
        expect(ids).toContain('proj-a-child');
        expect(ids).not.toContain('proj-b');
        expect(ids).not.toContain('referrals-root');
    });
});

describe('canAccessReferrer', () => {
    beforeEach(() => vi.clearAllMocks());

    it('always allows admins without querying memberships', async () => {
        const allowed = await canAccessReferrer({ id: 'u1', isAdmin: true }, 'proj-b');
        expect(allowed).toBe(true);
        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
    });

    it('denies non-admins for referrers without a linked project', async () => {
        const allowed = await canAccessReferrer({ id: 'u2' }, null);
        expect(allowed).toBe(false);
    });

    it('allows a member of the referrer sub-project', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
        const allowed = await canAccessReferrer({ id: 'u2' }, 'proj-a-child');
        expect(allowed).toBe(true);
    });

    it('denies non-members', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
        const allowed = await canAccessReferrer({ id: 'u2' }, 'proj-b');
        expect(allowed).toBe(false);
    });
});
