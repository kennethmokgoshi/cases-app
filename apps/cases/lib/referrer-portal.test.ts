import { describe, expect, it } from 'vitest';
import {
    calculateDiscountPartnerTotals,
    calculatePortalCommissionTotals,
    formatDocumentTypeLabel,
    isInCalendarMonth,
    maskAccountNumber,
    maskConsumerName,
    parseCaseServices,
    portalCommissionStatus,
    portalStageLabel,
    portalStatusTone,
    toPortalComment,
} from './referrer-portal';

describe('referrer portal privacy helpers', () => {
    it('masks consumer names to initial and surname only', () => {
        expect(maskConsumerName('Thabo', 'Mokoena')).toBe('T. Mokoena');
        expect(maskConsumerName('  lerato ', '  Dlamini  ')).toBe('L. Dlamini');
    });

    it('falls back safely when name fields are missing', () => {
        expect(maskConsumerName(null, null)).toBe('Referral client');
        expect(maskConsumerName('Amahle', null)).toBe('A.');
    });

    it('masks account numbers except the last four digits', () => {
        expect(maskAccountNumber('6212 3456 789')).toBe('*******6789');
        expect(maskAccountNumber(null)).toBeNull();
    });
});

describe('referrer portal commission helpers', () => {
    it('calculates earned, pending, and paid totals', () => {
        const totals = calculatePortalCommissionTotals([
            { isEligible: true, isPaid: false, commissionAmount: 200 },
            { isEligible: true, isPaid: true, commissionAmount: { toNumber: () => 300 } },
            { isEligible: false, isPaid: false, commissionAmount: 500 },
        ]);

        expect(totals).toEqual({
            totalReferrals: 3,
            commissionEarned: 500,
            commissionPending: 200,
            commissionPaid: 300,
        });
    });

    it('maps internal commission stages to referrer-safe labels', () => {
        expect(portalStageLabel('DEPOSIT_PAID')).toBe('Deposit paid');
        expect(portalStageLabel('ARREARS_3M')).toBe('Payment follow-up');
        expect(portalStageLabel(null)).toBe('In progress');
    });

    it('labels workflow statuses with their proper names, title-casing unknown codes', () => {
        expect(portalStageLabel('OUTSTANDING_DOCS')).toBe('Outstanding Documents');
        expect(portalStageLabel('SETTLED_SUCCESS')).toBe('Settled Successfully');
        expect(portalStageLabel('REQUESTED_VIA_DHS')).toBe('Requested via DHS');
        expect(portalStageLabel('SOME_UNKNOWN_CODE')).toBe('Some Unknown Code');
    });

    it('shows the payout status without exposing internal workflow notes', () => {
        expect(portalCommissionStatus({ isEligible: false, isPaid: false })).toBe('In progress');
        expect(portalCommissionStatus({ isEligible: true, isPaid: false })).toBe('Ready for payout');
        expect(portalCommissionStatus({ isEligible: true, isPaid: false, paymentRef: 'EFT-1' })).toBe('Paid');
    });
});

describe('referrer portal discussion comments', () => {
    it('marks the referrer own messages and shows their first name only', () => {
        const comment = toPortalComment({
            id: 'c-1',
            content: 'Any update?',
            createdAt: '2026-07-13T09:00:00Z',
            user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
        });

        expect(comment.fromReferrer).toBe(true);
        expect(comment.authorName).toBe('William');
    });

    it('labels staff replies with a first name and last initial', () => {
        const comment = toPortalComment({
            id: 'c-2',
            content: 'DHS transfer requested.',
            createdAt: '2026-07-13T10:00:00Z',
            user: { firstName: 'Aaron', lastName: 'Nzotho', userType: 'STAFF' },
        });

        expect(comment.fromReferrer).toBe(false);
        expect(comment.authorName).toBe('Aaron N. — Zenowethu');
    });
});

describe('parseCaseServices', () => {
    it('parses a JSON string array', () => {
        expect(parseCaseServices('["debt review flag removal","credit repair"]'))
            .toEqual(['debt review flag removal', 'credit repair']);
    });

    it('returns an empty list for null, invalid JSON, or non-array JSON', () => {
        expect(parseCaseServices(null)).toEqual([]);
        expect(parseCaseServices(undefined)).toEqual([]);
        expect(parseCaseServices('not-json')).toEqual([]);
        expect(parseCaseServices('{"a":1}')).toEqual([]);
    });

    it('drops non-string and empty entries', () => {
        expect(parseCaseServices('["credit repair", 42, "", "  ", null]')).toEqual(['credit repair']);
    });
});

describe('formatDocumentTypeLabel', () => {
    it('humanizes underscore-coded document types', () => {
        expect(formatDocumentTypeLabel('PROOF_OF_RESIDENCE')).toBe('Proof Of Residence');
        expect(formatDocumentTypeLabel('BANK_STATEMENT')).toBe('Bank Statement');
    });

    it('keeps known acronyms uppercase', () => {
        expect(formatDocumentTypeLabel('ID_DOCUMENT')).toBe('ID Document');
        expect(formatDocumentTypeLabel('POA')).toBe('POA');
        expect(formatDocumentTypeLabel('DHS_FORM')).toBe('DHS Form');
    });

    it('falls back to "Document" for empty input', () => {
        expect(formatDocumentTypeLabel(null)).toBe('Document');
        expect(formatDocumentTypeLabel('')).toBe('Document');
        expect(formatDocumentTypeLabel('_')).toBe('Document');
    });
});

describe('portalStatusTone', () => {
    it('maps settled stages and statuses to the settled tone', () => {
        expect(portalStatusTone('SETTLED')).toBe('settled');
        expect(portalStatusTone('SETTLED_SUCCESS')).toBe('settled');
    });

    it('maps completed workflow statuses to the completed (payment outstanding) tone', () => {
        expect(portalStatusTone('COMPLETED')).toBe('completed');
        expect(portalStatusTone('CL_INVOICED_PENDING')).toBe('completed');
    });

    it('maps working stages — anything from Requested via DHS onwards — to the progress tone', () => {
        expect(portalStatusTone('REQUESTED_VIA_DHS')).toBe('progress');
        expect(portalStatusTone('DOCUMENTS_EMAILED')).toBe('progress');
        expect(portalStatusTone('QUOTE_ACCEPTED')).toBe('progress');
        expect(portalStatusTone('PAYING_INSTALMENTS')).toBe('progress');
    });

    it('maps detour categories and arrears to the detour tone', () => {
        expect(portalStatusTone('IRFDC_1M')).toBe('detour');
        expect(portalStatusTone('ARREARS_2M')).toBe('detour');
        expect(portalStatusTone('COURT_POSTPONED')).toBe('detour');
    });

    it('maps overdue, lost, beginning, and unknown codes safely', () => {
        expect(portalStatusTone('OVERDUE')).toBe('attention');
        expect(portalStatusTone('CANCELLED')).toBe('lost');
        expect(portalStatusTone('NOT_LINKED')).toBe('neutral');
        expect(portalStatusTone('SOMETHING_UNKNOWN')).toBe('neutral');
        expect(portalStatusTone(null)).toBe('neutral');
    });
});

describe('isInCalendarMonth', () => {
    const now = new Date('2026-07-14T12:00:00Z');

    it('buckets dates into this and last calendar month', () => {
        expect(isInCalendarMonth('2026-07-02T00:00:00Z', now, 0)).toBe(true);
        expect(isInCalendarMonth('2026-06-30T00:00:00Z', now, 0)).toBe(false);
        expect(isInCalendarMonth('2026-06-05T00:00:00Z', now, 1)).toBe(true);
        expect(isInCalendarMonth('2026-05-31T12:00:00Z', now, 1)).toBe(false);
    });

    it('rejects null and invalid dates', () => {
        expect(isInCalendarMonth(null, now, 0)).toBe(false);
        expect(isInCalendarMonth('not-a-date', now, 0)).toBe(false);
    });
});

describe('calculateDiscountPartnerTotals', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    const thisMonth = new Date('2026-07-01T12:00:00Z');
    const lastMonth = new Date('2026-06-10T12:00:00Z');
    const older = new Date('2026-04-01T12:00:00Z');

    it('returns zeros for no referrals', () => {
        expect(calculateDiscountPartnerTotals([], now)).toEqual({
            totalReferrals: 0,
            referralsThisMonth: 0,
            referralsLastMonth: 0,
            totalCompleted: 0,
            completedThisMonth: 0,
            completedLastMonth: 0,
            totalSettled: 0,
            settledThisMonth: 0,
            settledLastMonth: 0,
            totalLost: 0,
            lostThisMonth: 0,
            lostLastMonth: 0,
            totalQuoted: 0,
            quotedThisMonth: 0,
            quotedLastMonth: 0,
            totalPaid: 0,
            paidThisMonth: 0,
            paidLastMonth: 0,
            totalSettledPaid: 0,
            settledPaidThisMonth: 0,
            settledPaidLastMonth: 0,
            totalInProgress: 0,
            inProgressThisMonth: 0,
            inProgressLastMonth: 0,
            totalCompletedOutstanding: 0,
            completedOutstandingThisMonth: 0,
            completedOutstandingLastMonth: 0,
            totalExpectedRevenue: 0,
            expectedRevenueThisMonth: 0,
            expectedRevenueLastMonth: 0,
        });
    });

    it('splits totals into all-time, this-month, and last-month buckets', () => {
        const totals = calculateDiscountPartnerTotals([
            {
                // Settled this month, referred this month.
                createdAt: thisMonth,
                stage: 'SETTLED',
                caseStatus: 'SETTLED_SUCCESS',
                settledAt: thisMonth,
                completedAt: lastMonth,
                quoteTotal: 5000,
                quoteDate: thisMonth,
                payments: [
                    { amount: 2000, date: thisMonth },
                    { amount: 1000, date: older },
                ],
            },
            {
                // Settled last month via case status (no commission stage).
                createdAt: older,
                stage: null,
                caseStatus: 'SETTLED',
                settledAt: lastMonth,
                completedAt: null,
                quoteTotal: 3000,
                quoteDate: older,
                payments: [{ amount: 3000, date: older }],
            },
            {
                // Work completed last month, payment outstanding.
                createdAt: lastMonth,
                stage: null,
                caseStatus: 'COMPLETED',
                settledAt: null,
                completedAt: lastMonth,
                quoteTotal: 4000,
                quoteDate: lastMonth,
                payments: [{ amount: 1500, date: lastMonth }],
            },
            {
                // Still being worked, but quoted and paid last month.
                createdAt: lastMonth,
                stage: 'PAYING_INSTALMENTS',
                caseStatus: 'REQUESTED_VIA_DHS',
                settledAt: null,
                completedAt: null,
                quoteTotal: 1500,
                quoteDate: lastMonth,
                payments: [{ amount: 500, date: lastMonth }],
            },
        ], now);

        expect(totals).toEqual({
            totalReferrals: 4,
            referralsThisMonth: 1,
            referralsLastMonth: 2,
            totalCompleted: 1,
            completedThisMonth: 0,
            completedLastMonth: 1,
            totalSettled: 2,
            settledThisMonth: 1,
            settledLastMonth: 1,
            totalLost: 0,
            lostThisMonth: 0,
            lostLastMonth: 0,
            totalQuoted: 13500,
            quotedThisMonth: 5000,
            quotedLastMonth: 5500,
            totalPaid: 8000,
            paidThisMonth: 2000,
            paidLastMonth: 2000,
            totalSettledPaid: 6000,
            settledPaidThisMonth: 2000,
            settledPaidLastMonth: 0,
            totalInProgress: 1,
            inProgressThisMonth: 0,
            inProgressLastMonth: 1,
            totalCompletedOutstanding: 2500,
            completedOutstandingThisMonth: 0,
            completedOutstandingLastMonth: 2500,
            totalExpectedRevenue: 5500,
            expectedRevenueThisMonth: 2000,
            expectedRevenueLastMonth: 3500,
        });
    });

    it('counts by workflow status — the lagging commission stage never overrides it', () => {
        const totals = calculateDiscountPartnerTotals([
            // Stage still says QUOTE_ACCEPTED but the case status is the truth: completed.
            { createdAt: thisMonth, stage: 'QUOTE_ACCEPTED', caseStatus: 'COMPLETED', settledAt: null, completedAt: thisMonth, quoteTotal: null, quoteDate: null, payments: [] },
            // Stage says SETTLED (COMPLETED maps there for payouts) but the file is still being worked.
            { createdAt: thisMonth, stage: 'SETTLED', caseStatus: 'REQUESTED_VIA_DHS', settledAt: null, completedAt: null, quoteTotal: null, quoteDate: null, payments: [] },
        ], now);
        expect(totals.totalCompleted).toBe(1);
        expect(totals.completedThisMonth).toBe(1);
        expect(totals.totalSettled).toBe(0);
    });

    it('ignores future-dated and invalid dates for month buckets', () => {
        const future = new Date('2026-08-01T12:00:00Z');
        const totals = calculateDiscountPartnerTotals([
            { createdAt: future, stage: null, caseStatus: null, settledAt: null, completedAt: null, quoteTotal: 100, quoteDate: 'not-a-date', payments: [{ amount: 50, date: future }] },
        ], now);
        expect(totals.referralsThisMonth).toBe(0);
        expect(totals.quotedThisMonth).toBe(0);
        expect(totals.paidThisMonth).toBe(0);
        expect(totals.totalPaid).toBe(50);
    });
});
