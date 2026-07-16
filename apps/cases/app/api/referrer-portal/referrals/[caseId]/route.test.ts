import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    referrerEarnsCommission: (referrerType: string | null | undefined) => referrerType !== 'DISCOUNT',
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@/lib/workflow-progress', () => ({
    getWorkflowInfo: () => ({
        label: 'DHS Requested',
        description: 'Transfer requested on the DHS portal',
        categoryName: 'In Progress',
        stageNumber: 3,
        isLost: false,
        isOverdue: false,
        percent: 30,
        barClass: 'bg-cyan-400/70',
    }),
    formatStatus: (code: string) => code.toLowerCase(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findFirst: vi.fn() },
        workflowLog: { findMany: vi.fn() },
        caseComment: { findMany: vi.fn() },
        invoice: { findFirst: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { GET } from './route';

function call(caseId = 'case-1') {
    return GET(
        new Request(`http://localhost/api/referrer-portal/referrals/${caseId}`),
        { params: Promise.resolve({ caseId }) },
    );
}

describe('GET /api/referrer-portal/referrals/[caseId]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    });

    it('rejects users without a linked referrer profile', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: false,
            status: 403,
            error: 'No active referrer portal profile is linked to this user',
        });

        const res = await call();

        expect(res.status).toBe(403);
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 for a case that belongs to another referrer', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce(null);

        const res = await call('case-9');

        expect(res.status).toBe(404);
        expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'case-9', referrerId: 'ref-1', deletedAt: null },
        }));
    });

    it('returns progress, masked consumer, history, and the discussion thread', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-2026-1020-43Z',
            status: 'REQUESTED_VIA_DHS',
            services: '["debt review flag removal","credit repair"]',
            serviceFee: null,
            createdAt: new Date('2026-06-01T09:00:00Z'),
            updatedAt: new Date('2026-07-01T09:00:00Z'),
            client: { firstName: 'Nomsa', lastName: 'Moeng' },
            referrer: { referrerType: 'COMMISSION', clientDiscountPercent: null },
            payments: [],
            invoices: [],
            referrerCommission: {
                stage: 'QUOTE_ACCEPTED',
                isEligible: false,
                isPaid: false,
                commissionAmount: { toNumber: () => 500 },
                paidAt: null,
                paymentRef: null,
            },
            documents: [
                { id: 'd-1', type: 'ID_DOCUMENT', uploadedAt: new Date('2026-06-05T09:00:00Z') },
                { id: 'd-2', type: 'PROOF_OF_RESIDENCE', uploadedAt: new Date('2026-06-04T09:00:00Z') },
            ],
        } as never);
        vi.mocked(prisma.workflowLog.findMany).mockResolvedValueOnce([
            { id: 'log-1', fromStatus: 'NEW', toStatus: 'DHS_REQUESTED', timestamp: new Date('2026-06-10T09:00:00Z') },
        ] as never);
        vi.mocked(prisma.caseComment.findMany).mockResolvedValueOnce([
            {
                id: 'c-1',
                content: 'Any update on this client?',
                createdAt: new Date('2026-06-15T09:00:00Z'),
                user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
            },
            {
                id: 'c-2',
                content: 'DHS transfer was requested yesterday.',
                createdAt: new Date('2026-06-16T09:00:00Z'),
                user: { firstName: 'Aaron', lastName: 'Nzotho', userType: 'STAFF' },
            },
        ] as never);

        const res = await call();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.consumerLabel).toBe('N. Moeng');
        // Workflow status drives the label — the lagging commission stage
        // (QUOTE_ACCEPTED here) must not leak into the display.
        expect(json.referralStatus).toBe('Requested via DHS');
        expect(json.commissionStage).toBe('QUOTE_ACCEPTED');
        expect(json.workflow.percent).toBe(30);
        expect(json.statusHistory).toEqual([
            expect.objectContaining({ from: 'new', to: 'dhs_requested' }),
        ]);
        expect(json.commission).toEqual(expect.objectContaining({ amount: 500, status: 'In progress' }));
        expect(json.referrerType).toBe('COMMISSION');
        expect(json.clientDiscountPercent).toBeNull();
        expect(json.financials).toBeNull();
        expect(json.services).toEqual(['debt review flag removal', 'credit repair']);
        expect(json.documents).toEqual([
            expect.objectContaining({ id: 'd-1', label: 'ID Document' }),
            expect.objectContaining({ id: 'd-2', label: 'Proof Of Residence' }),
        ]);
        expect(json.comments).toHaveLength(2);
        expect(json.comments[0]).toEqual(expect.objectContaining({ fromReferrer: true, authorName: 'William' }));
        expect(json.comments[1]).toEqual(expect.objectContaining({ fromReferrer: false, authorName: 'Aaron N. — Zenowethu' }));
        expect(prisma.caseComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { caseId: 'case-1', type: 'REFERRER' },
        }));
    });

    it('returns discount details for a discount referrer referral', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-2',
            fileNumber: 'ZDM-2026-1021-99A',
            status: 'NEW_LEAD',
            services: null,
            serviceFee: { toNumber: () => 5000 },
            createdAt: new Date('2026-06-01T09:00:00Z'),
            updatedAt: new Date('2026-07-01T09:00:00Z'),
            client: { firstName: 'Sipho', lastName: 'Nkosi' },
            referrer: { referrerType: 'DISCOUNT', clientDiscountPercent: { toNumber: () => 15 } },
            payments: [
                { id: 'p-1', amount: { toNumber: () => 2000 }, status: 'COMPLETED', date: new Date('2026-06-20T09:00:00Z') },
                { id: 'p-2', amount: { toNumber: () => 999 }, status: 'PENDING', date: new Date('2026-06-25T09:00:00Z') },
            ],
            invoices: [],
            referrerCommission: null,
            documents: [],
        } as never);
        vi.mocked(prisma.workflowLog.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.caseComment.findMany).mockResolvedValueOnce([] as never);

        const res = await call('case-2');
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrerType).toBe('DISCOUNT');
        expect(json.clientDiscountPercent).toBe(15);
        expect(json.services).toEqual([]);
        expect(json.documents).toEqual([]);
        expect(json.commissionStage).toBe('NEW_LEAD');
        expect(json.financials).toMatchObject({
            quoteTotal: 5000,
            totalPaid: 2000,
            outstanding: 3000,
        });
        // Only COMPLETED payments appear, with their amounts and dates
        expect(json.financials.payments).toEqual([
            expect.objectContaining({ id: 'p-1', amount: 2000 }),
        ]);
    });
});
