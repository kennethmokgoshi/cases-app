import { describe, expect, it } from 'vitest';
import {
    accountsMatch,
    inferAccountType,
    mapExtractedAccountToCandidate,
    mapExtractedAdverseListingToCandidate,
    parseAiDate,
} from './credit-account-sync';

describe('inferAccountType', () => {
    it('detects a mortgage/bond creditor', () => {
        expect(inferAccountType('SA Home Loans')).toBe('Mortgage');
    });

    it('falls back to Other for unrecognised creditors', () => {
        expect(inferAccountType('Some Random Creditor')).toBe('Other');
    });
});

describe('parseAiDate', () => {
    it('parses a valid ISO date string', () => {
        const d = parseAiDate('2024-01-15');
        expect(d).not.toBeNull();
        expect(d?.getUTCFullYear()).toBe(2024);
    });

    it('treats the literal "NA" as no date', () => {
        expect(parseAiDate('NA')).toBeNull();
        expect(parseAiDate(null)).toBeNull();
        expect(parseAiDate(undefined)).toBeNull();
    });
});

describe('accountsMatch', () => {
    it('matches by account number when both present', () => {
        expect(
            accountsMatch(
                { creditorName: 'Edgars', accountNumber: '12345' },
                { creditorName: 'EDGARS STORES', accountNumber: '12345' }
            )
        ).toBe(true);
    });

    it('falls back to creditor name when account numbers are missing', () => {
        expect(
            accountsMatch(
                { creditorName: 'Truworths', accountNumber: null },
                { creditorName: 'truworths', accountNumber: null }
            )
        ).toBe(true);
    });

    it('does not match different creditors with no account numbers', () => {
        expect(
            accountsMatch(
                { creditorName: 'Truworths', accountNumber: null },
                { creditorName: 'Edgars', accountNumber: null }
            )
        ).toBe(false);
    });
});

describe('mapExtractedAccountToCandidate', () => {
    it('maps a raw AI-extracted account into a NEW candidate when no existing match', () => {
        const candidate = mapExtractedAccountToCandidate(
            {
                creditor: 'African Bank',
                accountNumber: '999888',
                balance: 8467,
                installment: 450,
                status: 'Current',
                lastPaymentDate: '2026-06-01',
            },
            { id: 'doc-1', type: 'CREDIT_REPORT_EXPERIAN' },
            []
        );

        expect(candidate.matchStatus).toBe('NEW');
        expect(candidate.existingAccountId).toBeNull();
        expect(candidate.creditorName).toBe('African Bank');
        expect(candidate.outstandingBalance).toBe(8467);
        expect(candidate.accountType).toBe('Other');
    });

    it('flags a candidate as DUPLICATE when it matches an existing CreditAccount', () => {
        const candidate = mapExtractedAccountToCandidate(
            { creditor: 'Edgars', accountNumber: '12345', balance: 1840, status: 'Prescribed' },
            { id: 'doc-1', type: 'CREDIT_REPORT_EXPERIAN' },
            [{ id: 'existing-1', creditorName: 'Edgars', accountNumber: '12345' }]
        );

        expect(candidate.matchStatus).toBe('DUPLICATE');
        expect(candidate.existingAccountId).toBe('existing-1');
    });

    it('defaults status to ACTIVE when the AI returns no status', () => {
        const candidate = mapExtractedAccountToCandidate(
            { creditor: 'Capfin', balance: 500 },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(candidate.status).toBe('ACTIVE');
    });

    it('maps a closed/paid-up account (balance 0) with its original opening amount', () => {
        const candidate = mapExtractedAccountToCandidate(
            { creditor: 'Truworths', accountNumber: '555', originalAmount: 5000, balance: 0, status: 'Paid Up' },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(candidate.originalAmount).toBe(5000);
        expect(candidate.outstandingBalance).toBe(0);
        expect(candidate.status).toBe('Paid Up');
    });

    it('leaves originalAmount null when the AI does not report one', () => {
        const candidate = mapExtractedAccountToCandidate(
            { creditor: 'Capfin', balance: 500 },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(candidate.originalAmount).toBeNull();
    });
});

describe('mapExtractedAdverseListingToCandidate', () => {
    it('maps a written-off adverse listing into a candidate using openBalance', () => {
        const candidate = mapExtractedAdverseListingToCandidate(
            {
                creditor: 'LEWIS STORES',
                accountNumber: '0903150',
                adverseCode: 'Written Off',
                lastPaymentDate: '2024-11-07',
                openBalance: 33330,
                overdueBalance: 33330,
                status: 'WRITTEN OFF',
            },
            { id: 'doc-1', type: 'CREDIT_REPORT_EXPERIAN' },
            []
        );

        expect(candidate.matchStatus).toBe('NEW');
        expect(candidate.creditorName).toBe('LEWIS STORES');
        expect(candidate.outstandingBalance).toBe(33330);
        expect(candidate.status).toBe('WRITTEN OFF');
        expect(candidate.accountType).toBe('Retail');
    });

    it('falls back to overdueBalance when openBalance is missing', () => {
        const candidate = mapExtractedAdverseListingToCandidate(
            { creditor: 'African Bank', overdueBalance: 1200 },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(candidate.outstandingBalance).toBe(1200);
    });

    it('falls back to adverseCode when status is missing, and to a generic label when both are missing', () => {
        const withCode = mapExtractedAdverseListingToCandidate(
            { creditor: 'X', adverseCode: 'Handed Over' },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(withCode.status).toBe('Handed Over');

        const withNeither = mapExtractedAdverseListingToCandidate(
            { creditor: 'X' },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            []
        );
        expect(withNeither.status).toBe('ADVERSE LISTING');
    });

    it('flags a DUPLICATE when it matches an existing CreditAccount by account number', () => {
        const candidate = mapExtractedAdverseListingToCandidate(
            { creditor: 'LEWIS STORES', accountNumber: '0903150', openBalance: 33330, status: 'WRITTEN OFF' },
            { id: 'doc-1', type: 'CREDIT_REPORT' },
            [{ id: 'existing-1', creditorName: 'LEWIS STORES', accountNumber: '0903150' }]
        );
        expect(candidate.matchStatus).toBe('DUPLICATE');
        expect(candidate.existingAccountId).toBe('existing-1');
    });
});
