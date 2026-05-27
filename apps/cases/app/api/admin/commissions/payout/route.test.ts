import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrerCommission: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
        $transaction: vi.fn(async (cb) => {
            return cb({
                referrerCommission: { update: vi.fn() },
                caseComment: { create: vi.fn() },
            });
        }),
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

describe('POST /api/admin/commissions/payout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({
            user: { id: 'admin-1', isAdmin: true },
        });
    });

    it('returns 401 if unauthorized', async () => {
        (auth as any).mockResolvedValueOnce(null);
        const req = new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ commissionIds: ['1'], paymentRef: 'REF123' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('returns 403 if not manager/admin', async () => {
        (auth as any).mockResolvedValueOnce({ user: { id: 'user-1', role: 'STAFF' } });
        const req = new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ commissionIds: ['1'], paymentRef: 'REF123' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns 422 for invalid body', async () => {
        const req = new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ commissionIds: [] }), // empty array invalid
        });
        const res = await POST(req);
        expect(res.status).toBe(422);
    });

    it('returns 400 if no eligible unpaid commissions found', async () => {
        (prisma.referrerCommission.findMany as any).mockResolvedValueOnce([]);

        const req = new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ commissionIds: ['c-1'], paymentRef: 'REF123' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'No eligible unpaid commissions found' });
    });

    it('successfully processes payout and creates audit log', async () => {
        const mockCommissions = [
            {
                id: 'c-1',
                caseId: 'case-1',
                commissionAmount: { toNumber: () => 1500 },
                referrer: { firstName: 'John', lastName: 'Doe' },
            },
        ];
        (prisma.referrerCommission.findMany as any).mockResolvedValueOnce(mockCommissions);

        const req = new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ commissionIds: ['c-1'], paymentRef: 'FNB-PAY-01', notes: 'Done' }),
        });
        const res = await POST(req);
        
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.count).toBe(1);
        expect(data.totalPaid).toBe(1500);

        expect(prisma.$transaction).toHaveBeenCalled();
    });
});
