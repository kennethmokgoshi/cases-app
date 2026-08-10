import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: { findMany: vi.fn() },
        case: { findFirst: vi.fn(), findUnique: vi.fn() },
        user: { findMany: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { getB2BAllowedProjectIds, canB2BAccessCase, getMentionableUsersForB2B } from './b2b-case-access';

const db = prisma as unknown as {
    project: { findMany: ReturnType<typeof vi.fn> };
    case: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe('getB2BAllowedProjectIds', () => {
    it('includes the partner project and every descendant project', async () => {
        db.project.findMany.mockResolvedValue([
            { id: 'partner-1', parentId: null },
            { id: 'branch-1', parentId: 'partner-1' },
            { id: 'year-1', parentId: 'branch-1' },
            { id: 'other-partner', parentId: null },
        ]);

        const ids = await getB2BAllowedProjectIds('partner-1');

        expect(ids).toEqual(['partner-1', 'branch-1', 'year-1']);
    });
});

describe('canB2BAccessCase', () => {
    it('returns true when the case is filed under the partner hierarchy', async () => {
        db.project.findMany.mockResolvedValue([{ id: 'partner-1', parentId: null }]);
        db.case.findFirst.mockResolvedValue({ id: 'case-1' });

        const result = await canB2BAccessCase('case-1', 'partner-1');

        expect(result).toBe(true);
        expect(db.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: 'case-1',
                projects: { some: { projectId: { in: ['partner-1'] } } },
            }),
        }));
    });

    it('returns false when the case is outside the partner hierarchy', async () => {
        db.project.findMany.mockResolvedValue([{ id: 'partner-1', parentId: null }]);
        db.case.findFirst.mockResolvedValue(null);

        const result = await canB2BAccessCase('case-2', 'partner-1');

        expect(result).toBe(false);
    });
});

describe('getMentionableUsersForB2B', () => {
    it('returns an empty list when the case does not exist', async () => {
        db.case.findUnique.mockResolvedValue(null);

        const result = await getMentionableUsersForB2B('missing-case', 'partner-1');

        expect(result).toEqual([]);
        expect(db.user.findMany).not.toHaveBeenCalled();
    });

    it('resolves case staff (assignee, creator, project members) plus same-org B2B users', async () => {
        db.case.findUnique.mockResolvedValue({
            assignedToId: 'staff-assignee',
            createdById: 'staff-creator',
            projects: [
                { project: { members: [{ userId: 'staff-member-1' }, { userId: 'staff-assignee' }] } },
            ],
        });
        db.user.findMany.mockResolvedValue([
            { id: 'staff-assignee', email: 'a@zenowethu.co.za', firstName: 'A', lastName: 'One', username: 'a1', userType: 'STAFF', emailNotificationsEnabled: true },
            { id: 'partner-user-2', email: 'p2@partner.co.za', firstName: 'P', lastName: 'Two', username: 'p2', userType: 'B2B_PARTNER', emailNotificationsEnabled: true },
        ]);

        const result = await getMentionableUsersForB2B('case-1', 'partner-1');

        expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                isLocked: false,
                OR: [
                    { id: { in: ['staff-assignee', 'staff-creator', 'staff-member-1'] } },
                    { userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' },
                ],
            },
        }));
        expect(result).toHaveLength(2);
    });
});
