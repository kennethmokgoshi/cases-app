import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrerCommission: { findMany: vi.fn(), count: vi.fn() },
        project: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const admin = { user: { id: 'admin-1', isAdmin: true, role: 'ADMIN' } };
const manager = { user: { id: 'mgr-1', isAdmin: false, role: 'MANAGER' } };

const allProjects = [
    { id: 'root', parentId: null },
    { id: 'proj-a', parentId: 'root' },
    { id: 'proj-b', parentId: 'root' },
];

const req = () => new Request('http://localhost/api/admin/commissions');

describe('GET /api/admin/commissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.referrerCommission.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.referrerCommission.count).mockResolvedValue(0 as never);
    });

    it('returns 403 for ordinary staff', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 's1', role: 'MEMBER' } } as never);
        const res = await GET(req());
        expect(res.status).toBe(403);
    });

    it('does not scope admins', async () => {
        vi.mocked(auth).mockResolvedValueOnce(admin as never);
        await GET(req());
        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
        expect(vi.mocked(prisma.referrerCommission.findMany).mock.calls[0][0]).toMatchObject({
            where: { isEligible: true, isPaid: false },
        });
    });

    it('scopes a manager to referrers they are a member of', async () => {
        vi.mocked(auth).mockResolvedValueOnce(manager as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([
            { projectId: 'proj-a' },
        ] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce(allProjects as never);

        await GET(req());

        expect(vi.mocked(prisma.referrerCommission.findMany).mock.calls[0][0]).toMatchObject({
            where: { referrer: { projectId: { in: ['proj-a'] } } },
        });
    });
});
