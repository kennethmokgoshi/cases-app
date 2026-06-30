import { describe, it, expect } from 'vitest';
import { summariseCaseFinancials, formatRand } from './case-financials';

describe('summariseCaseFinancials', () => {
    it('computes paid, outstanding and percent for a normal case', () => {
        const s = summariseCaseFinancials({
            serviceFee: 4500,
            payments: [
                { amount: 1500, status: 'COMPLETED' },
                { amount: '1500', status: 'COMPLETED' },
            ],
            invoices: [{ total: 4500, status: 'SENT' }],
        });
        expect(s.totalPaid).toBe(3000);
        expect(s.outstanding).toBe(1500);
        expect(s.overCollected).toBe(0);
        expect(s.percentCollected).toBe(67);
        expect(s.invoicedTotal).toBe(4500);
    });

    it('ignores unallocated/cancelled payments and cancelled invoices', () => {
        const s = summariseCaseFinancials({
            serviceFee: 1000,
            payments: [
                { amount: 500, status: 'COMPLETED' },
                { amount: 999, status: 'UNALLOCATED' },
            ],
            invoices: [{ total: 800, status: 'CANCELLED' }],
        });
        expect(s.totalPaid).toBe(500);
        expect(s.invoicedTotal).toBe(0);
        expect(s.paymentCount).toBe(2);
    });

    it('flags over-collection when payments exceed the fee', () => {
        const s = summariseCaseFinancials({
            serviceFee: 1000,
            payments: [{ amount: 1300, status: 'COMPLETED' }],
            invoices: [],
        });
        expect(s.outstanding).toBe(0);
        expect(s.overCollected).toBe(300);
        expect(s.percentCollected).toBe(100);
    });

    it('handles a missing service fee without crashing', () => {
        const s = summariseCaseFinancials({
            serviceFee: null,
            payments: [{ amount: 200, status: 'COMPLETED' }],
            invoices: [],
        });
        expect(s.serviceFee).toBeNull();
        expect(s.outstanding).toBeNull();
        expect(s.percentCollected).toBeNull();
        expect(s.overCollected).toBe(0);
        expect(s.totalPaid).toBe(200);
    });

    it('totals accepted quotes and computes the remaining balance after payments', () => {
        const s = summariseCaseFinancials({
            serviceFee: null,
            payments: [{ amount: 1000, status: 'COMPLETED' }],
            invoices: [{ total: 4500, status: 'ACCEPTED', type: 'QUOTE' }],
        });
        expect(s.acceptedQuotesTotal).toBe(4500);
        expect(s.acceptedQuoteCount).toBe(1);
        // 4500 accepted - 1000 paid = 3500 remaining
        expect(s.quoteBalance).toBe(3500);
        // A quote is not an invoice
        expect(s.invoicedTotal).toBe(0);
    });

    it('floors the quote balance at 0 once accepted quotes are fully paid', () => {
        const s = summariseCaseFinancials({
            serviceFee: null,
            payments: [{ amount: 5000, status: 'COMPLETED' }],
            invoices: [{ total: 4500, status: 'ACCEPTED', type: 'QUOTE' }],
        });
        expect(s.quoteBalance).toBe(0);
    });

    it('only counts ACCEPTED quotes, not pending/rejected quotes or invoices', () => {
        const s = summariseCaseFinancials({
            serviceFee: null,
            payments: [],
            invoices: [
                { total: 4500, status: 'ACCEPTED', type: 'QUOTE' },
                { total: 2000, status: 'SENT', type: 'QUOTE' },
                { total: 9999, status: 'ACCEPTED', type: 'INVOICE' },
            ],
        });
        expect(s.acceptedQuotesTotal).toBe(4500);
        expect(s.acceptedQuoteCount).toBe(1);
    });

    it('returns a null quote balance when there are no accepted quotes', () => {
        const s = summariseCaseFinancials({
            serviceFee: 1000,
            payments: [{ amount: 500, status: 'COMPLETED' }],
            invoices: [{ total: 1000, status: 'SENT', type: 'INVOICE' }],
        });
        expect(s.acceptedQuotesTotal).toBe(0);
        expect(s.acceptedQuoteCount).toBe(0);
        expect(s.quoteBalance).toBeNull();
    });
});

describe('formatRand', () => {
    it('formats numbers as SA rand (en-ZA: space thousands, comma decimals)', () => {
        // Strip non-breaking/narrow spaces for a locale-stable assertion
        expect(formatRand(4500).replace(/\s/gu, ' ')).toBe('R 4 500,00');
    });

    it('returns a dash for null, undefined and non-numeric values', () => {
        expect(formatRand(null)).toBe('—');
        expect(formatRand(undefined)).toBe('—');
        expect(formatRand('abc')).toBe('—');
    });
});
