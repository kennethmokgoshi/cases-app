import { describe, expect, it } from 'vitest';
import {
    calculatePortalCommissionTotals,
    formatDocumentTypeLabel,
    maskAccountNumber,
    maskConsumerName,
    parseCaseServices,
    portalCommissionStatus,
    portalStageLabel,
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
