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
            referrerType: 'COMMISSION',
            clientDiscountPercent: null,
            commissionType: 'FIXED',
            fixedCommissionAmount: { toNumber: () => 200 },
            cases: [
                {
                    id: 'case-1',
                    fileNumber: 'ZDM-1',
                    status: 'IN_PROGRESS',
                    createdAt: new Date('2026-07-01T10:00:00Z'),
                    serviceFee: null,
                    payments: [],
                    invoices: [],
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
        expect(json.discountSummary).toBeNull();
        expect(prisma.referrer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ref-1' } }));
    });

    it('returns discount partner totals with quote and payment money for discount referrers', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-2', firstName: 'William', lastName: 'Maesela' },
        });

        const now = Date.now();
        const recent = new Date(now - 5 * 24 * 60 * 60 * 1000);   // 5 days ago
        const old = new Date(now - 60 * 24 * 60 * 60 * 1000);     // 60 days ago

        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-2',
            firstName: 'William',
            lastName: 'Maesela',
            email: 'william@example.com',
            cellNumber: null,
            bankName: null,
            accountNumber: null,
            accountType: null,
            branchCode: null,
            accountHolderName: null,
            referrerType: 'DISCOUNT',
            clientDiscountPercent: { toNumber: () => 15 },
            commissionType: 'FIXED',
            fixedCommissionAmount: null,
            cases: [
                {
                    id: 'case-a',
                    fileNumber: 'ZDM-A',
                    status: 'COMPLETED',
                    createdAt: recent,
                    serviceFee: { toNumber: () => 5000 },
                    payments: [
                        { amount: { toNumber: () => 2000 }, status: 'COMPLETED', date: recent },
                        { amount: { toNumber: () => 1000 }, status: 'COMPLETED', date: old },
                        { amount: { toNumber: () => 999 }, status: 'PENDING', date: recent },
                    ],
                    invoices: [],
                    client: { firstName: 'Sipho', lastName: 'Nkosi' },
                    referrerCommission: {
                        id: 'com-a',
                        stage: 'SETTLED',
                        isEligible: false,
                        commissionAmount: null,
                        isPaid: false,
                        paidAt: null,
                        paymentRef: null,
                        updatedAt: recent,
                    },
                },
                {
                    id: 'case-b',
                    fileNumber: 'ZDM-B',
                    status: 'NEW_LEAD',
                    createdAt: old,
                    serviceFee: null,
                    payments: [],
                    invoices: [
                        { total: { toNumber: () => 3000 }, status: 'SENT', type: 'QUOTE', acceptedAt: old, createdAt: old },
                    ],
                    client: { firstName: 'Lerato', lastName: 'Dlamini' },
                    referrerCommission: null,
                },
            ],
            paymentQueries: [],
        } as never);

        const res = await GET();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrer.referrerType).toBe('DISCOUNT');
        expect(json.referrer.clientDiscountPercent).toBe(15);
        expect(json.discountSummary).toEqual({
            totalReferrals: 2,
            referralsLast30Days: 1,
            totalSettled: 1,
            settledLast30Days: 1,
            totalQuoted: 8000,       // 5000 service fee + 3000 accepted quote
            quotedLast30Days: 5000,  // only the recent case's fee basis
            totalPaid: 3000,         // completed payments only — PENDING excluded
            paidLast30Days: 2000,
        });
        expect(json.referrals[0]).toMatchObject({ quoteTotal: 5000, totalPaid: 3000 });
        expect(json.referrals[1]).toMatchObject({ quoteTotal: 3000, totalPaid: 0 });
    });
});
