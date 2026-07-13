import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
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
    beforeEach(() => vi.clearAllMocks());

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
            status: 'DHS_REQUESTED',
            createdAt: new Date('2026-06-01T09:00:00Z'),
            updatedAt: new Date('2026-07-01T09:00:00Z'),
            client: { firstName: 'Nomsa', lastName: 'Moeng' },
            referrerCommission: {
                stage: 'QUOTE_ACCEPTED',
                isEligible: false,
                isPaid: false,
                commissionAmount: { toNumber: () => 500 },
                paidAt: null,
                paymentRef: null,
            },
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
        expect(json.referralStatus).toBe('Quote accepted');
        expect(json.workflow.percent).toBe(30);
        expect(json.statusHistory).toEqual([
            expect.objectContaining({ from: 'new', to: 'dhs_requested' }),
        ]);
        expect(json.commission).toEqual(expect.objectContaining({ amount: 500, status: 'In progress' }));
        expect(json.comments).toHaveLength(2);
        expect(json.comments[0]).toEqual(expect.objectContaining({ fromReferrer: true, authorName: 'William' }));
        expect(json.comments[1]).toEqual(expect.objectContaining({ fromReferrer: false, authorName: 'Aaron N. — Zenowethu' }));
        expect(prisma.caseComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { caseId: 'case-1', type: 'REFERRER' },
        }));
    });
});
