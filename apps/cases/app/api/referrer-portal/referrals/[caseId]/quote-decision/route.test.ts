import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/finance/quote-case-sync', () => ({
    recordQuoteDecision: vi.fn(),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        invoice: {
            findFirst: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { recordQuoteDecision } from '@zenowethu/shared-lib/src/finance/quote-case-sync';
import { POST } from './route';

function req(body: unknown) {
    return new Request('http://localhost/api/referrer-portal/referrals/case-1/quote-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/referrer-portal/referrals/[caseId]/quote-decision', () => {
    beforeEach(() => vi.clearAllMocks());

    it('records quote accept decision successfully', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });

        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-1',
        } as never);

        vi.mocked(prisma.invoice.findFirst).mockResolvedValueOnce({
            id: 'quote-1',
            invoiceNumber: 'QUO-1',
            total: 3500,
        } as never);

        vi.mocked(recordQuoteDecision).mockResolvedValueOnce({
            ok: true,
            quoteTotal: 3500,
        } as never);

        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-123',
            content: 'Quote QUO-1 (R 3500.00) was ACCEPTED by the referrer.',
        } as never);

        const res = await POST(req({ decision: 'ACCEPT', notes: 'Client happy.' }), {
            params: Promise.resolve({ caseId: 'case-1' }),
        });
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.decision).toBe('ACCEPT');
        expect(recordQuoteDecision).toHaveBeenCalledWith({
            quoteId: 'quote-1',
            decision: 'ACCEPTED',
            note: 'Client happy.',
            userId: 'user-1',
        });
    });
});
