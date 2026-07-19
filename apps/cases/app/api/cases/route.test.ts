import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    auth: vi.fn(),
    WORKFLOW_STATUSES: [
        { code: 'COMPLETED', category: 'COMPLETED' },
        { code: 'SETTLED', category: 'SETTLED' },
        { code: 'BEGINNING', category: 'BEGINNING' },
        { code: 'OVERDUE', category: 'OVERDUE' },
        { code: 'LOST', category: 'LOST' },
        { code: 'PAYING', category: 'PAYING' },
    ],
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
        case: { findMany: vi.fn(), count: vi.fn() },
    },
}));

const db = prisma as unknown as {
    project: { findMany: ReturnType<typeof vi.fn> };
    projectMember: { findMany: ReturnType<typeof vi.fn> };
    case: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
        user: { id: 'staff1', isAdmin: true, role: 'ADMIN', userType: 'STAFF' }
    } as any);
    db.project.findMany.mockResolvedValue([]);
    db.case.findMany.mockResolvedValue([]);
    db.case.count.mockResolvedValue(0);
});

describe('GET /api/cases - custom sorting and limits', () => {
    it('respects default ordering by recordedAt desc when no orderBy is provided', async () => {
        const req = new Request('https://app.zenowethu.co.za/api/cases');
        const res = await GET(req);
        expect(res.status).toBe(200);

        expect(db.case.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { recordedAt: 'desc' },
                take: 10000,
            })
        );
    });

    it('respects custom orderBy updatedAt and take parameters', async () => {
        const req = new Request('https://app.zenowethu.co.za/api/cases?orderBy=updatedAt&take=50');
        const res = await GET(req);
        expect(res.status).toBe(200);

        expect(db.case.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { updatedAt: 'desc' },
                take: 50,
            })
        );
    });

    it('respects custom orderBy createdAt and orderDir asc', async () => {
        const req = new Request('https://app.zenowethu.co.za/api/cases?orderBy=createdAt&orderDir=asc');
        const res = await GET(req);
        expect(res.status).toBe(200);

        expect(db.case.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { createdAt: 'asc' },
            })
        );
    });
});
