import { describe, expect, it } from 'vitest';

import { summariseCaseFinancials } from './case-financials';

describe('shared finance case financials', () => {
  it('uses an accepted quote as the balance basis when service fee is blank', () => {
    const summary = summariseCaseFinancials({
      serviceFee: null,
      invoices: [{ total: '4500', status: 'SENT', type: 'QUOTE', acceptedAt: new Date('2026-07-01') }],
      payments: [{ amount: '2250', status: 'COMPLETED' }],
    });

    expect(summary.feeBasisSource).toBe('ACCEPTED_QUOTE');
    expect(summary.acceptedQuotesTotal).toBe(4500);
    expect(summary.totalPaid).toBe(2250);
    expect(summary.outstanding).toBe(2250);
  });

  it('does not count cancelled payments toward the paid total', () => {
    const summary = summariseCaseFinancials({
      serviceFee: '1000',
      invoices: [],
      payments: [
        { amount: '1000', status: 'CANCELLED' },
        { amount: '400', status: 'COMPLETED' },
      ],
    });

    expect(summary.totalPaid).toBe(400);
    expect(summary.outstanding).toBe(600);
  });
});
