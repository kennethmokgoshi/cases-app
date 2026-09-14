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
    referrerVisibilityWhere,
    commissionVisibilityWhere,
    getReferrerAccessLevel,
    checkMemberContactUpdate,
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

describe('referrerVisibilityWhere', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is unrestricted for admins', async () => {
        const where = await referrerVisibilityWhere({ id: 'u1', isAdmin: true });
        expect(where).toEqual({});
        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
    });

    it('restricts non-admins to their memberships and descendants', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
        const where = await referrerVisibilityWhere({ id: 'u2' });
        expect(where).toEqual({ projectId: { in: ['proj-a', 'proj-a-child'] } });
    });

    it('matches nothing when the user has no memberships', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        const where = await referrerVisibilityWhere({ id: 'u3' });
        expect(where).toEqual({ projectId: { in: [] } });
    });
});

describe('commissionVisibilityWhere', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is unrestricted for admins', async () => {
        expect(await commissionVisibilityWhere({ id: 'u1', isAdmin: true })).toEqual({});
    });

    it('scopes commissions through the referrer relation', async () => {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-b' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
        const where = await commissionVisibilityWhere({ id: 'u2' });
        expect(where).toEqual({ referrer: { projectId: { in: ['proj-b'] } } });
    });
});

describe('getReferrerAccessLevel', () => {
    beforeEach(() => vi.clearAllMocks());

    // "Manager at Letsatsi" — a MANAGER membership on the parent manages every
    // branch below it; a MEMBER membership on one branch manages none.
    function mockMemberships(rows: { projectId: string; role: string }[]) {
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce(rows as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);
    }

    it('gives admins full access without querying memberships', async () => {
        const level = await getReferrerAccessLevel({ id: 'u1', isAdmin: true }, 'proj-b');
        expect(level).toBe('MANAGER');
        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
    });

    it('makes a MANAGER of a parent project a manager of its descendants', async () => {
        mockMemberships([{ projectId: 'proj-a', role: 'MANAGER' }]);
        expect(await getReferrerAccessLevel({ id: 'u2' }, 'proj-a-child')).toBe('MANAGER');
    });

    it('leaves a plain member as MEMBER on the project they belong to', async () => {
        mockMemberships([{ projectId: 'proj-a', role: 'MEMBER' }]);
        expect(await getReferrerAccessLevel({ id: 'u2' }, 'proj-a-child')).toBe('MEMBER');
    });

    it('keeps the two roles independent across different parents', async () => {
        // MEMBER of proj-b, MANAGER of proj-a — proj-b stays view/add-only
        mockMemberships([
            { projectId: 'proj-b', role: 'MEMBER' },
            { projectId: 'proj-a', role: 'MANAGER' },
        ]);
        expect(await getReferrerAccessLevel({ id: 'u2' }, 'proj-b')).toBe('MEMBER');

        mockMemberships([
            { projectId: 'proj-b', role: 'MEMBER' },
            { projectId: 'proj-a', role: 'MANAGER' },
        ]);
        expect(await getReferrerAccessLevel({ id: 'u2' }, 'proj-a-child')).toBe('MANAGER');
    });

    it('returns NONE for a project the user does not belong to', async () => {
        mockMemberships([{ projectId: 'proj-a', role: 'MANAGER' }]);
        expect(await getReferrerAccessLevel({ id: 'u2' }, 'proj-b')).toBe('NONE');
    });

    it('returns NONE for a referrer with no linked project', async () => {
        expect(await getReferrerAccessLevel({ id: 'u2' }, null)).toBe('NONE');
    });
});

describe('checkMemberContactUpdate', () => {
    const blank = { email: null, cellNumber: null };

    it('allows filling in a blank email and cell number', () => {
        expect(
            checkMemberContactUpdate({ email: 'a@b.co.za', cellNumber: '0821234567' }, blank)
        ).toBeNull();
    });

    it('rejects any field outside email and cell number', () => {
        const denial = checkMemberContactUpdate({ bankName: 'FNB' }, blank);
        expect(denial).toContain('bankName');
    });

    it('rejects changing a contact detail that is already there', () => {
        const denial = checkMemberContactUpdate(
            { email: 'new@b.co.za' },
            { email: 'old@b.co.za', cellNumber: null }
        );
        expect(denial).toContain('already has an email address');
    });

    it('allows re-sending an unchanged value', () => {
        expect(
            checkMemberContactUpdate({ email: 'same@b.co.za' }, { email: 'same@b.co.za', cellNumber: null })
        ).toBeNull();
    });

    it('rejects clearing a contact detail', () => {
        expect(checkMemberContactUpdate({ cellNumber: null }, { email: null, cellNumber: '0821234567' }))
            .toContain('cannot clear');
    });
});
