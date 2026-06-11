import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { aggregate: vi.fn(), count: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const session = { user: { id: 'u1', isAdmin: true } };

describe('GET /api/finance/quotes/stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('computes issued, pending, rejected and acceptance rate', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.aggregate)
            .mockResolvedValueOnce({ _sum: { total: 15000 }, _count: 3 } as any)  // issued
            .mockResolvedValueOnce({ _sum: { total: 4000 }, _count: 2 } as any)   // pending
            .mockResolvedValueOnce({ _sum: { total: 1000 }, _count: 1 } as any);  // rejected
        vi.mocked(prisma.invoice.count).mockResolvedValue(2);

        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.issuedCount).toBe(3);
        expect(body.issuedValue).toBe(15000);
        expect(body.pendingCount).toBe(2);
        expect(body.rejectedCount).toBe(1);
        expect(body.convertedCount).toBe(2);
        expect(body.acceptanceRate).toBe(75); // 3 of 4 decided
    });

    it('returns null acceptance rate when nothing decided yet', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.aggregate)
            .mockResolvedValueOnce({ _sum: { total: null }, _count: 0 } as any)
            .mockResolvedValueOnce({ _sum: { total: null }, _count: 0 } as any)
            .mockResolvedValueOnce({ _sum: { total: null }, _count: 0 } as any);
        vi.mocked(prisma.invoice.count).mockResolvedValue(0);

        const res = await GET();
        const body = await res.json();
        expect(body.acceptanceRate).toBeNull();
        expect(body.issuedValue).toBe(0);
    });
});
