import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: { findMany: vi.fn() },
        project: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const admin = { user: { id: 'admin-1', isAdmin: true } };
const staff = { user: { id: 'staff-1', isAdmin: false, role: 'MEMBER' } };

const referrerRow = {
    id: 'ref-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    cellNumber: '0821234567',
    isActive: true,
    projectId: 'proj-a',
};

// Tree: root → proj-a → proj-a-child ; root → proj-b
const allProjects = [
    { id: 'root', parentId: null },
    { id: 'proj-a', parentId: 'root' },
    { id: 'proj-a-child', parentId: 'proj-a' },
    { id: 'proj-b', parentId: 'root' },
];

describe('GET /api/admin/referrers/dropdown', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when signed out', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('does not filter by project for admins', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        vi.mocked(prisma.referrer.findMany)
            .mockResolvedValueOnce([referrerRow] as never)   // scoped list
            .mockResolvedValueOnce([{ projectId: 'proj-a' }] as never); // linked ids
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([] as never);

        const res = await GET();
        const body = await res.json();

        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
        expect(vi.mocked(prisma.referrer.findMany).mock.calls[0][0]).toMatchObject({ where: {} });
        expect(body.referrers).toHaveLength(1);
    });

    it('limits non-admins to referrers in projects they are a member of', async () => {
        vi.mocked(auth).mockResolvedValueOnce(staff as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany)
            .mockResolvedValueOnce(allProjects as never)  // graph load
            .mockResolvedValueOnce([] as never);          // orphan sub-projects
        vi.mocked(prisma.referrer.findMany)
            .mockResolvedValueOnce([referrerRow] as never)
            .mockResolvedValueOnce([{ projectId: 'proj-a' }] as never);

        await GET();

        expect(vi.mocked(prisma.referrer.findMany).mock.calls[0][0]).toMatchObject({
            where: { projectId: { in: ['proj-a', 'proj-a-child'] } },
        });
        // Orphan REFERRER sub-projects are scoped the same way
        expect(vi.mocked(prisma.project.findMany).mock.calls[1][0]).toMatchObject({
            where: { type: 'REFERRER', id: { in: ['proj-a', 'proj-a-child'] } },
        });
    });

    it('returns nothing for a non-admin with no memberships', async () => {
        vi.mocked(auth).mockResolvedValueOnce(staff as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.referrer.findMany)
            .mockResolvedValueOnce([] as never)
            .mockResolvedValueOnce([{ projectId: 'proj-a' }] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([] as never);

        const res = await GET();
        const body = await res.json();
        expect(body.referrers).toEqual([]);
    });
});
