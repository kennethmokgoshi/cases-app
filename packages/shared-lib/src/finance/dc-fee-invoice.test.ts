import { describe, it, expect } from 'vitest';
import {
  DC_FEE_REASONS,
  dcFeeReasonLabel,
  dcFeeDocLabel,
  dcFeeInvoiceInputSchema,
  computeDcFeeTotals,
  buildConsumerReference,
  consumerLabelFromReference,
  buildDcFeeLineDescription,
  ZA_VAT_RATE,
} from './dc-fee-invoice';

const validInput = {
  dcName: 'Jane Counsellor',
  dcEmail: 'jane@dc.co.za',
  dcTradingName: 'Jane DC Services',
  clientFirstName: 'John',
  clientLastName: 'Dlamini',
  clientIdNumber: '8001015009087',
  applyVat: true,
  notes: 'Settle before transfer.',
  lineItems: [
    { reasonKey: 'COMMISSION_PAID_OUT', description: 'Commission paid out', amount: 1000 },
    { reasonKey: 'ADMIN_FEES', description: 'Admin fees', amount: 500 },
  ],
} as const;

describe('dcFeeReasonLabel', () => {
  it('returns the catalogue label for a known key', () => {
    expect(dcFeeReasonLabel('AFTER_CARE_FEES')).toBe('After-care fees');
  });
  it('falls back to the key for an unknown value', () => {
    expect(dcFeeReasonLabel('NOPE')).toBe('NOPE');
  });
  it('includes the four user-requested reasons plus extras', () => {
    const keys = DC_FEE_REASONS.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining(['COMMISSION_PAID_OUT', 'AFTER_CARE_FEES', 'ADMIN_FEES', 'LEGAL_FEES']),
    );
    expect(keys.length).toBeGreaterThan(4);
  });
});

describe('computeDcFeeTotals', () => {
  it('sums line amounts and applies 15% VAT when requested', () => {
    const t = computeDcFeeTotals([{ amount: 1000 }, { amount: 500 }], true);
    expect(t).toEqual({ subtotal: 1500, vatRate: ZA_VAT_RATE, vatAmount: 225, total: 1725 });
  });
  it('omits VAT when applyVat is false', () => {
    const t = computeDcFeeTotals([{ amount: 1000 }, { amount: 500 }], false);
    expect(t).toEqual({ subtotal: 1500, vatRate: 0, vatAmount: 0, total: 1500 });
  });
  it('rounds the subtotal to two decimals without float drift', () => {
    // 0.1 + 0.2 is the classic float case (0.30000000000000004) — round2 must fix it.
    const t = computeDcFeeTotals([{ amount: 0.1 }, { amount: 0.2 }], false);
    expect(t.subtotal).toBe(0.3);
    expect(t.total).toBe(0.3);
  });
  it('rounds VAT to two decimals (cents)', () => {
    const t = computeDcFeeTotals([{ amount: 99.99 }], true);
    expect(t.subtotal).toBe(99.99);
    expect(t.vatAmount).toBe(15); // 99.99 * 0.15 = 14.9985 → 15.00
    expect(t.total).toBe(114.99);
  });
  it('handles an empty list as zero', () => {
    expect(computeDcFeeTotals([], true)).toEqual({ subtotal: 0, vatRate: ZA_VAT_RATE, vatAmount: 0, total: 0 });
  });
});

describe('buildConsumerReference', () => {
  it('formats the consumer name and ID', () => {
    expect(
      buildConsumerReference({ clientFirstName: 'John', clientLastName: 'Dlamini', clientIdNumber: '8001015009087' }),
    ).toBe('Outstanding fees re: John Dlamini (ID: 8001015009087)');
  });
});

describe('consumerLabelFromReference', () => {
  it('strips the "Outstanding fees re: " prefix', () => {
    expect(
      consumerLabelFromReference('Outstanding fees re: Uelenda Mononyane (ID: 8608020432086)'),
    ).toBe('Uelenda Mononyane (ID: 8608020432086)');
  });
  it('is a round-trip with buildConsumerReference', () => {
    const ref = buildConsumerReference({
      clientFirstName: 'John',
      clientLastName: 'Dlamini',
      clientIdNumber: '8001015009087',
    });
    expect(consumerLabelFromReference(ref)).toBe('John Dlamini (ID: 8001015009087)');
  });
  it('returns an empty string for null/undefined/blank input', () => {
    expect(consumerLabelFromReference(null)).toBe('');
    expect(consumerLabelFromReference(undefined)).toBe('');
    expect(consumerLabelFromReference('')).toBe('');
  });
});

describe('buildDcFeeLineDescription', () => {
  it('folds the consumer into the fee reason as a natural sentence', () => {
    expect(
      buildDcFeeLineDescription('Commission paid out', 'Uelenda Mononyane (ID: 8608020432086)'),
    ).toBe('Outstanding fees commission paid out for Uelenda Mononyane (ID: 8608020432086)');
  });
  it('preserves embedded acronyms while lower-casing the first letter only', () => {
    expect(buildDcFeeLineDescription('Rejection fee (Form 17.1)', 'A B (ID: 1)')).toBe(
      'Outstanding fees rejection fee (Form 17.1) for A B (ID: 1)',
    );
  });
  it('omits the "for …" clause when no consumer is known', () => {
    expect(buildDcFeeLineDescription('Admin fees', '')).toBe('Outstanding fees admin fees');
  });
});

describe('dcFeeInvoiceInputSchema', () => {
  it('accepts a valid payload', () => {
    expect(dcFeeInvoiceInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('allows an empty DC email (optional)', () => {
    const r = dcFeeInvoiceInputSchema.safeParse({ ...validInput, dcEmail: '' });
    expect(r.success).toBe(true);
  });

  it('rejects a missing debt counsellor name', () => {
    const r = dcFeeInvoiceInputSchema.safeParse({ ...validInput, dcName: '' });
    expect(r.success).toBe(false);
  });

  it('rejects an ID number that is not 13 digits', () => {
    const r = dcFeeInvoiceInputSchema.safeParse({ ...validInput, clientIdNumber: '12345' });
    expect(r.success).toBe(false);
  });

  it('rejects when there are no fee lines', () => {
    const r = dcFeeInvoiceInputSchema.safeParse({ ...validInput, lineItems: [] });
    expect(r.success).toBe(false);
  });

  it('rejects a non-positive fee amount', () => {
    const r = dcFeeInvoiceInputSchema.safeParse({
      ...validInput,
      lineItems: [{ reasonKey: 'ADMIN_FEES', description: 'Admin fees', amount: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('defaults applyVat to true when omitted', () => {
    const { applyVat: _omit, ...rest } = validInput;
    const r = dcFeeInvoiceInputSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.applyVat).toBe(true);
  });

  it('defaults documentType to INVOICE and accepts QUOTE', () => {
    const r1 = dcFeeInvoiceInputSchema.safeParse(validInput);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.documentType).toBe('INVOICE');

    const r2 = dcFeeInvoiceInputSchema.safeParse({ ...validInput, documentType: 'QUOTE' });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.documentType).toBe('QUOTE');
  });
});

describe('dcFeeDocLabel', () => {
  it('labels the document kind', () => {
    expect(dcFeeDocLabel('INVOICE')).toBe('Invoice');
    expect(dcFeeDocLabel('QUOTE')).toBe('Quotation');
  });
});
