import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    referrerEarnsCommission: (referrerType: string | null | undefined) => referrerType !== 'DISCOUNT',
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        referrer: {
            findUnique: vi.fn(),
        },
        referrerPaymentQuery: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { POST } from './route';

function req(body: unknown) {
    return new Request('http://localhost/api/referrer-portal/payment-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/referrer-portal/payment-queries', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects invalid query details', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });

        const res = await POST(req({ caseId: 'case-1', notes: 'too short' }));

        expect(res.status).toBe(422);
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a discount referrer — no commission to follow up on', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ referrerType: 'DISCOUNT' } as never);

        const res = await POST(req({ caseId: 'case-1', notes: 'Please check this client payment.' }));

        expect(res.status).toBe(403);
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
        expect(prisma.referrerPaymentQuery.create).not.toHaveBeenCalled();
    });

    it('rejects a case that is not linked to the current referrer', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ referrerType: 'COMMISSION' } as never);
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce(null);

        const res = await POST(req({ caseId: 'case-2', notes: 'Please check this client payment.' }));

        expect(res.status).toBe(404);
        expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'case-2', referrerId: 'ref-1', deletedAt: null },
        }));
    });

    it('creates a pending follow-up for the current referrer case', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ referrerType: 'COMMISSION' } as never);
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-1',
            client: { firstName: 'Thabo', lastName: 'Mokoena' },
            referrerCommission: { id: 'com-1' },
        } as never);
        vi.mocked(prisma.referrerPaymentQuery.create).mockResolvedValueOnce({
            id: 'query-1',
            caseId: 'case-1',
            commissionId: 'com-1',
            status: 'PENDING',
            claimedPaidAt: new Date('2026-07-01T00:00:00Z'),
            claimedAmount: { toNumber: () => 350 },
            notes: 'Please check this client payment.',
            createdAt: new Date('2026-07-01T10:00:00Z'),
            updatedAt: new Date('2026-07-01T10:00:00Z'),
        } as never);

        const res = await POST(req({
            caseId: 'case-1',
            claimedPaidAt: '2026-07-01',
            claimedAmount: 350,
            notes: 'Please check this client payment.',
        }));
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.paymentQuery.consumerLabel).toBe('T. Mokoena');
        expect(prisma.referrerPaymentQuery.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                referrerId: 'ref-1',
                caseId: 'case-1',
                commissionId: 'com-1',
                submittedByUserId: 'user-1',
                status: 'PENDING',
            }),
        }));
    });
});
