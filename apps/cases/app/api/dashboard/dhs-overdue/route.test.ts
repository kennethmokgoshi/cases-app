import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
        case: { findMany: vi.fn() },
    },
}));

const db = prisma as unknown as {
    project: { findMany: ReturnType<typeof vi.fn> };
    projectMember: { findMany: ReturnType<typeof vi.fn> };
    case: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
    db.project.findMany.mockResolvedValue([]);
    db.case.findMany.mockResolvedValue([]);
});

describe('GET /api/dashboard/dhs-overdue', () => {
    it('returns 401 when there is no session', async () => {
        vi.mocked(auth).mockResolvedValue(null as any);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('admins query without a project restriction and see isAdminOnly cases too', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'admin1', isAdmin: true, role: 'ADMIN' } } as any);

        const res = await GET();
        expect(res.status).toBe(200);
        expect(db.projectMember.findMany).not.toHaveBeenCalled();
        expect(db.case.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'REQUESTED_VIA_DHS',
                    isOverdue: true,
                }),
            })
        );
        const whereArg = db.case.findMany.mock.calls[0][0].where;
        expect(whereArg.isAdminOnly).toBeUndefined();
        expect(whereArg.projects).toBeUndefined();
    });

    it('restricts a non-admin STAFF user to their ProjectMember projects, expanded to descendants', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'staff-shosholoza', isAdmin: false, role: 'MEMBER', userType: 'STAFF' },
        } as any);
        db.projectMember.findMany.mockResolvedValue([{ projectId: 'shosholoza-root' }]);
        db.project.findMany.mockResolvedValue([
            { id: 'shosholoza-root', parentId: null },
            { id: 'shosholoza-2026', parentId: 'shosholoza-root' },
            { id: 'letsatsi-root', parentId: null },
            { id: 'letsatsi-2026', parentId: 'letsatsi-root' },
        ]);

        await GET();

        const whereArg = db.case.findMany.mock.calls[0][0].where;
        expect(whereArg.isAdminOnly).toBe(false);
        const allowedIds: string[] = whereArg.projects.some.projectId.in;
        expect(allowedIds).toEqual(expect.arrayContaining(['shosholoza-root', 'shosholoza-2026']));
        expect(allowedIds).not.toEqual(expect.arrayContaining(['letsatsi-root', 'letsatsi-2026']));
    });

    it('falls back to only the user\'s own cases when they have no project access at all', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'nobody', isAdmin: false, role: 'MEMBER', userType: 'STAFF' },
        } as any);
        db.projectMember.findMany.mockResolvedValue([]);

        await GET();

        const whereArg = db.case.findMany.mock.calls[0][0].where;
        expect(whereArg.createdById).toBe('nobody');
        expect(whereArg.projects).toBeUndefined();
    });

    it('maps cases to a lean response shape with client/project fallbacks', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'admin1', isAdmin: true, role: 'ADMIN' } } as any);
        db.case.findMany.mockResolvedValue([
            {
                id: 'case-1',
                fileNumber: 'ZDM-2026-001',
                daysInStatus: 12,
                statusEntryDate: new Date('2026-07-01'),
                client: { firstName: 'Jane', lastName: 'Doe' },
                projects: [{ project: { name: 'Shosholoza' } }],
            },
            {
                id: 'case-2',
                fileNumber: 'ZDM-2026-002',
                daysInStatus: 9,
                statusEntryDate: new Date('2026-07-05'),
                client: null,
                projects: [],
            },
        ]);

        const res = await GET();
        const body = await res.json();

        expect(body.count).toBe(2);
        expect(body.cases[0]).toMatchObject({ id: 'case-1', clientName: 'Jane Doe', projectName: 'Shosholoza' });
        expect(body.cases[1]).toMatchObject({ id: 'case-2', clientName: 'Unknown Client', projectName: 'Unknown Project' });
    });
});
