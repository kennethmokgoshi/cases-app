import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findUnique: vi.fn(),
        },
        referrerCommission: {
            findMany: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const adminSession = {
    user: { id: 'admin-1', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' },
};

function req() {
    return new Request('http://localhost/api/admin/referrers/ref-1/commission');
}

function ctx(id = 'ref-1') {
    return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/referrers/[id]/commission', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        const res = await GET(req(), ctx());

        expect(res.status).toBe(401);
    });

    it('uses linked case count for total referrals even when no commission records exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce(adminSession as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'William',
            lastName: 'Maesela',
            portalUser: null,
            _count: { cases: 9 },
        } as never);
        vi.mocked(prisma.referrerCommission.findMany).mockResolvedValueOnce([]);

        const res = await GET(req(), ctx());
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.summary.total).toBe(9);
        expect(json.summary.commissionRecords).toBe(0);
    });

    it('still calculates commission totals from commission records', async () => {
        vi.mocked(auth).mockResolvedValueOnce(adminSession as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'William',
            lastName: 'Maesela',
            portalUser: null,
            _count: { cases: 9 },
        } as never);
        vi.mocked(prisma.referrerCommission.findMany).mockResolvedValueOnce([
            { isEligible: true, isPaid: false, commissionAmount: 200 },
            { isEligible: true, isPaid: true, commissionAmount: 300 },
        ] as never);

        const res = await GET(req(), ctx());
        const json = await res.json();

        expect(json.summary).toMatchObject({
            total: 9,
            commissionRecords: 2,
            eligible: 2,
            paid: 1,
            unpaidEligible: 1,
            totalAmountOwed: 200,
            totalAmountPaid: 300,
        });
    });
});
