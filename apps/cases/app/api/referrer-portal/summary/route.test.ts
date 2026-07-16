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
            missingClientReports: [],
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
        expect(json.discountSummary).toMatchObject({
            totalReferrals: 1,
        });
        expect(json.referrals[0].commissionStage).toBe('DEPOSIT_PAID');
        expect(prisma.referrer.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'ref-1' },
            select: expect.objectContaining({
                cases: expect.objectContaining({
                    where: { deletedAt: null },
                }),
            }),
        }));
    });

    it('returns discount partner calendar-month totals with quote and payment money', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
        try {
            vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
                ok: true,
                sessionUserId: 'user-1',
                referrer: { id: 'ref-2', firstName: 'William', lastName: 'Maesela' },
            });

            const thisMonth = new Date('2026-07-09T10:00:00Z');
            const lastMonth = new Date('2026-06-10T10:00:00Z');
            const older = new Date('2026-05-15T10:00:00Z');

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
                        status: 'SETTLED_SUCCESS',
                        createdAt: thisMonth,
                        serviceFee: { toNumber: () => 5000 },
                        payments: [
                            { amount: { toNumber: () => 2000 }, status: 'COMPLETED', date: thisMonth },
                            { amount: { toNumber: () => 1000 }, status: 'COMPLETED', date: older },
                            { amount: { toNumber: () => 999 }, status: 'PENDING', date: thisMonth },
                        ],
                        invoices: [],
                        workflowLogs: [
                            { toStatus: 'SETTLED_SUCCESS', timestamp: thisMonth },
                            { toStatus: 'COMPLETED', timestamp: lastMonth },
                        ],
                        client: { firstName: 'Sipho', lastName: 'Nkosi' },
                        referrerCommission: {
                            id: 'com-a',
                            stage: 'SETTLED',
                            isEligible: false,
                            commissionAmount: null,
                            isPaid: false,
                            paidAt: null,
                            paymentRef: null,
                            updatedAt: thisMonth,
                        },
                    },
                    {
                        id: 'case-b',
                        fileNumber: 'ZDM-B',
                        status: 'COMPLETED',
                        createdAt: lastMonth,
                        serviceFee: null,
                        payments: [],
                        invoices: [],
                        workflowLogs: [
                            { toStatus: 'COMPLETED', timestamp: lastMonth },
                        ],
                        client: { firstName: 'Zanele', lastName: 'Khumalo' },
                        referrerCommission: null,
                    },
                    {
                        id: 'case-c',
                        fileNumber: 'ZDM-C',
                        status: 'NEW_LEAD',
                        createdAt: older,
                        serviceFee: null,
                        payments: [],
                        invoices: [
                            { total: { toNumber: () => 3000 }, status: 'SENT', type: 'QUOTE', acceptedAt: older, createdAt: older },
                        ],
                        workflowLogs: [],
                        client: { firstName: 'Lerato', lastName: 'Dlamini' },
                        referrerCommission: null,
                    },
                ],
                paymentQueries: [],
                missingClientReports: [],
            } as never);

            const res = await GET();
            const json = await res.json();

            expect(res.status).toBe(200);
            expect(json.referrer.referrerType).toBe('DISCOUNT');
            expect(json.referrer.clientDiscountPercent).toBe(15);
            expect(json.discountSummary).toEqual({
                totalReferrals: 3,
                referralsThisMonth: 1,     // case-a
                referralsLastMonth: 1,     // case-b
                totalCompleted: 1,         // case-b — work done, payment outstanding
                completedThisMonth: 0,
                completedLastMonth: 1,
                totalSettled: 1,           // case-a — workflow status SETTLED_SUCCESS
                settledThisMonth: 1,
                settledLastMonth: 0,
                totalQuoted: 8000,         // 5000 service fee + 3000 accepted quote
                quotedThisMonth: 5000,     // only case-a's fee basis dates to July
                quotedLastMonth: 0,
                totalPaid: 3000,           // completed payments only — PENDING excluded
                paidThisMonth: 2000,
                paidLastMonth: 0,
                totalOutstanding: 5000,
                outstandingThisMonth: 2000,
                outstandingLastMonth: 0,
            });
            // Labels and tones come from the workflow status, never the commission stage.
            expect(json.referrals[0]).toMatchObject({ quoteTotal: 5000, totalPaid: 3000, paidThisMonth: 2000, paidLastMonth: 0, statusTone: 'settled', referralStatus: 'Settled Successfully', commissionStage: 'SETTLED' });
            expect(json.referrals[1]).toMatchObject({ statusTone: 'completed', referralStatus: 'Completed', commissionStage: 'NEW_LEAD' });
            expect(json.referrals[2]).toMatchObject({ quoteTotal: 3000, totalPaid: 0, statusTone: 'neutral', referralStatus: 'New referral', commissionStage: 'NEW_LEAD' });
            // Quote stats: only case-c has an invoice of type QUOTE with status SENT
            expect(json.quoteStats).toMatchObject({
                totalCount: 1,
                totalAmount: 3000,
                acceptedCount: 0,
                acceptedAmount: 0,
                pendingCount: 1,
                pendingAmount: 3000,
                rejectedCount: 0,
                rejectedAmount: 0,
            });
            // No missing client reports
            expect(json.missingClientReports).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});
