import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findUnique: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { GET } from './route';

describe('GET /api/referrer-portal/summary', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the access error when the signed-in user is not linked to a referrer', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: false,
            status: 403,
            error: 'No active referrer portal profile is linked to this user',
        });

        const res = await GET();

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'No active referrer portal profile is linked to this user' });
    });

    it('returns masked referral rows and commission totals for the linked referrer only', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: 'nomsa@example.com',
            cellNumber: '0820000000',
            bankName: 'FNB',
            accountNumber: '123456789',
            accountType: 'CHEQUE',
            branchCode: '250655',
            accountHolderName: 'Nomsa Dube',
            commissionType: 'FIXED',
            fixedCommissionAmount: { toNumber: () => 200 },
            cases: [
                {
                    id: 'case-1',
                    fileNumber: 'ZDM-1',
                    status: 'IN_PROGRESS',
                    createdAt: new Date('2026-07-01T10:00:00Z'),
                    client: { firstName: 'Thabo', lastName: 'Mokoena' },
                    referrerCommission: {
                        id: 'com-1',
                        stage: 'DEPOSIT_PAID',
                        isEligible: true,
                        commissionAmount: { toNumber: () => 200 },
                        isPaid: false,
                        paidAt: null,
                        paymentRef: null,
                        updatedAt: new Date('2026-07-01T11:00:00Z'),
                    },
                },
            ],
            paymentQueries: [],
        } as never);

        const res = await GET();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrals[0].consumerLabel).toBe('T. Mokoena');
        expect(JSON.stringify(json)).not.toContain('8001015009087');
        expect(json.summary).toMatchObject({
            totalReferrals: 1,
            commissionEarned: 200,
            commissionPending: 200,
            commissionPaid: 0,
        });
        expect(prisma.referrer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ref-1' } }));
    });
});
