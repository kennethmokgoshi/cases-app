import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
        invoice: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
        payment: { aggregate: vi.fn() },
        referrer: { findUnique: vi.fn() },
        referrerCommission: { findUnique: vi.fn(), upsert: vi.fn() },
    },
}));

vi.mock('../logger', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { prisma } from '@zenowethu/database';
import {
    getWorkflowStatusRank,
    isForwardStatusTransition,
    advanceCaseStatusIfForward,
    recordQuoteDecision,
    checkQuoteFulfilment,
    checkQuoteFulfilmentSafe,
} from './quote-case-sync';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('isForwardStatusTransition', () => {
    it('treats moving from an early stage to QUOTE_ACCEPTED as forward', () => {
        expect(isForwardStatusTransition('ACCEPTED_VIA_DHS', 'QUOTE_ACCEPTED')).toBe(true);
        expect(isForwardStatusTransition('PAID_R350', 'QUOTE_ACCEPTED')).toBe(true);
    });

    it('treats moving backwards from SETTLED as not forward', () => {
        expect(isForwardStatusTransition('SETTLED_SUCCESS', 'QUOTE_ACCEPTED')).toBe(false);
        expect(isForwardStatusTransition('SETTLED', 'QUOTE_ACCEPTED')).toBe(false);
    });

    it('treats COMPLETED → QUOTE_ACCEPTED as forward (fees are collected after work completes)', () => {
        expect(isForwardStatusTransition('COMPLETED', 'QUOTE_ACCEPTED')).toBe(true);
    });

    it('never resurrects LOST cases', () => {
        expect(isForwardStatusTransition('CANCELLED', 'QUOTE_ACCEPTED')).toBe(false);
        expect(isForwardStatusTransition('CANCELLED', 'SETTLED_SUCCESS')).toBe(false);
    });

    it('allows QUOTE_ACCEPTED → SETTLED_SUCCESS', () => {
        expect(isForwardStatusTransition('QUOTE_ACCEPTED', 'SETTLED_SUCCESS')).toBe(true);
    });

    it('rejects unknown targets and allows unknown/legacy current statuses', () => {
        expect(isForwardStatusTransition('NEW_CASE', 'NOT_A_STATUS')).toBe(false);
        expect(isForwardStatusTransition('SOME_LEGACY_STATUS', 'QUOTE_ACCEPTED')).toBe(true);
    });

    it('is not forward when the status is unchanged', () => {
        expect(isForwardStatusTransition('QUOTE_ACCEPTED', 'QUOTE_ACCEPTED')).toBe(false);
    });

    it('ranks both new sync statuses on the board', () => {
        expect(getWorkflowStatusRank('QUOTE_ACCEPTED')).toBeGreaterThan(-1);
        expect(getWorkflowStatusRank('SETTLED_SUCCESS')).toBeGreaterThan(getWorkflowStatusRank('QUOTE_ACCEPTED'));
    });
});

describe('advanceCaseStatusIfForward', () => {
    it('moves a case forward and writes a workflow log', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'ACCEPTED_VIA_DHS', referrerId: null,
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);

        const result = await advanceCaseStatusIfForward({
            caseId: 'case-1', toStatus: 'QUOTE_ACCEPTED', userId: 'u1', notes: 'Quote QUO-1 accepted',
        });

        expect(result).toEqual({ moved: true, fromStatus: 'ACCEPTED_VIA_DHS', toStatus: 'QUOTE_ACCEPTED' });
        const updateArgs = vi.mocked(prisma.case.update).mock.calls[0][0] as any;
        expect(updateArgs.data.status).toBe('QUOTE_ACCEPTED');
        expect(updateArgs.data.daysInStatus).toBe(0);
        expect(updateArgs.data.isOverdue).toBe(false);
        expect(updateArgs.data.workflowLogs.create.fromStatus).toBe('ACCEPTED_VIA_DHS');
        expect(updateArgs.data.workflowLogs.create.toStatus).toBe('QUOTE_ACCEPTED');
        expect(updateArgs.data.workflowLogs.create.notes).toBe('Quote QUO-1 accepted');
    });

    it('does not move a case backwards', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'SETTLED_SUCCESS', referrerId: null,
        } as any);

        const result = await advanceCaseStatusIfForward({ caseId: 'case-1', toStatus: 'QUOTE_ACCEPTED' });

        expect(result.moved).toBe(false);
        expect(result.reason).toBe('NOT_FORWARD');
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the case is already at the target status', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'QUOTE_ACCEPTED', referrerId: null,
        } as any);

        const result = await advanceCaseStatusIfForward({ caseId: 'case-1', toStatus: 'QUOTE_ACCEPTED' });

        expect(result.moved).toBe(false);
        expect(result.reason).toBe('ALREADY_THERE');
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('returns CASE_NOT_FOUND for a missing case', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null);
        const result = await advanceCaseStatusIfForward({ caseId: 'nope', toStatus: 'QUOTE_ACCEPTED' });
        expect(result).toEqual({ moved: false, reason: 'CASE_NOT_FOUND' });
    });

    it('syncs the referrer commission stage when the case has a referrer', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'PAID_R350', referrerId: 'ref-1',
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);
        vi.mocked(prisma.referrerCommission.upsert).mockResolvedValue({} as any);

        await advanceCaseStatusIfForward({ caseId: 'case-1', toStatus: 'QUOTE_ACCEPTED', userId: 'u1' });

        const upsertArgs = vi.mocked(prisma.referrerCommission.upsert).mock.calls[0][0] as any;
        expect(upsertArgs.where).toEqual({ caseId: 'case-1' });
        expect(upsertArgs.create.stage).toBe('QUOTE_ACCEPTED');
        expect(upsertArgs.create.isEligible).toBe(false);
    });
});

describe('recordQuoteDecision', () => {
    it('refuses a decision on a non-quote document', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'q1', type: 'INVOICE', status: 'SENT', caseId: null, invoiceNumber: 'INV-2026-0001',
        } as any);

        const result = await recordQuoteDecision({ quoteId: 'q1', decision: 'ACCEPTED', userId: 'u1' });
        expect(result).toEqual({ ok: false, status: 409, error: 'Only quotations can be accepted or rejected' });
    });

    it('refuses a decision on a converted quote', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'q1', type: 'QUOTE', status: 'CONVERTED', caseId: null, invoiceNumber: 'QUO-2026-0001',
        } as any);

        const result = await recordQuoteDecision({ quoteId: 'q1', decision: 'ACCEPTED', userId: 'u1' });
        expect(result).toMatchObject({ ok: false, status: 409 });
    });

    it('accepting a case-linked quote advances the case to QUOTE_ACCEPTED', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'q1', type: 'QUOTE', status: 'SENT', caseId: 'case-1', invoiceNumber: 'QUO-2026-0056',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'q1', status: 'ACCEPTED' } as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'ACCEPTED_VIA_DHS', referrerId: null,
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);

        const result = await recordQuoteDecision({ quoteId: 'q1', decision: 'ACCEPTED', userId: 'u1' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.caseSync).toEqual({
                moved: true, fromStatus: 'ACCEPTED_VIA_DHS', toStatus: 'QUOTE_ACCEPTED',
            });
        }
        const invoiceUpdate = vi.mocked(prisma.invoice.update).mock.calls[0][0] as any;
        expect(invoiceUpdate.data.status).toBe('ACCEPTED');
        expect(invoiceUpdate.data.acceptedAt).toBeInstanceOf(Date);
        expect(invoiceUpdate.data.decidedById).toBe('u1');
    });

    it('a rejected quote never touches the case status', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'q1', type: 'QUOTE', status: 'SENT', caseId: 'case-1', invoiceNumber: 'QUO-2026-0056',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'q1', status: 'REJECTED' } as any);

        const result = await recordQuoteDecision({ quoteId: 'q1', decision: 'REJECTED', userId: 'u1' });

        expect(result.ok).toBe(true);
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('a case sync failure does not fail the decision', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'q1', type: 'QUOTE', status: 'SENT', caseId: 'case-1', invoiceNumber: 'QUO-2026-0056',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'q1', status: 'ACCEPTED' } as any);
        vi.mocked(prisma.case.findUnique).mockRejectedValue(new Error('db down'));

        const result = await recordQuoteDecision({ quoteId: 'q1', decision: 'ACCEPTED', userId: 'u1' });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.caseSync).toBeNull();
    });
});

describe('checkQuoteFulfilment', () => {
    it('returns checked: false when the case has no accepted quote', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
        const result = await checkQuoteFulfilment('case-1');
        expect(result).toEqual({ checked: false });
        expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    });

    it('does not advance the case while captured < quoted', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0056', total: 5000, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 3000 } } as any);

        const result = await checkQuoteFulfilment('case-1', 'u1');

        expect(result).toEqual({ checked: true, quoteTotal: 5000, captured: 3000, fulfilled: false });
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('advances the case to SETTLED_SUCCESS when captured ≥ quoted', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0056', total: 5000, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 5000 } } as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'QUOTE_ACCEPTED', referrerId: null,
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);

        const result = await checkQuoteFulfilment('case-1', 'u1');

        expect(result.fulfilled).toBe(true);
        expect(result.caseSync).toEqual({
            moved: true, fromStatus: 'QUOTE_ACCEPTED', toStatus: 'SETTLED_SUCCESS',
        });
        const updateArgs = vi.mocked(prisma.case.update).mock.calls[0][0] as any;
        expect(updateArgs.data.status).toBe('SETTLED_SUCCESS');
    });

    it('counts a converted invoice marked PAID without payment rows as captured', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0056', total: 5000,
            convertedToInvoice: { status: 'PAID', total: 5000 },
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'QUOTE_ACCEPTED', referrerId: null,
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);

        const result = await checkQuoteFulfilment('case-1');

        expect(result.fulfilled).toBe(true);
        expect(result.captured).toBe(5000);
    });

    it('never fulfils against a zero-total quote', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0056', total: 0, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 100 } } as any);

        const result = await checkQuoteFulfilment('case-1');

        expect(result.fulfilled).toBe(false);
        expect(prisma.case.update).not.toHaveBeenCalled();
    });
});

describe('checkQuoteFulfilmentSafe', () => {
    it('returns null without querying when there is no caseId', async () => {
        const result = await checkQuoteFulfilmentSafe(null);
        expect(result).toBeNull();
        expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
    });

    it('swallows errors so payment capture never fails on sync', async () => {
        vi.mocked(prisma.invoice.findFirst).mockRejectedValue(new Error('db down'));
        const result = await checkQuoteFulfilmentSafe('case-1');
        expect(result).toBeNull();
    });
});
