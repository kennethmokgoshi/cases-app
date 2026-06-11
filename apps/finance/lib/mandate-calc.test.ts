import { describe, it, expect } from 'vitest';
import {
    lookupBranchCode,
    calcNumInstalments,
    calcTotalFromInstalments,
    calcMonthlyFromTotal,
    calcLastCollectionDate,
    deriveMandateTerms,
    SA_BANKS,
} from './mandate-calc';

describe('lookupBranchCode', () => {
    it('resolves canonical bank names to universal branch codes', () => {
        expect(lookupBranchCode('Capitec Bank')).toBe('470010');
        expect(lookupBranchCode('First National Bank (FNB)')).toBe('250655');
        expect(lookupBranchCode('Standard Bank')).toBe('051001');
        expect(lookupBranchCode('ABSA Bank')).toBe('632005');
        expect(lookupBranchCode('Nedbank')).toBe('198765');
    });

    it('resolves common aliases and casing', () => {
        expect(lookupBranchCode('fnb')).toBe('250655');
        expect(lookupBranchCode('CAPITEC')).toBe('470010');
        expect(lookupBranchCode('  absa ')).toBe('632005');
    });

    it('resolves loose contains matches like account-type suffixes', () => {
        expect(lookupBranchCode('Capitec Business Account')).toBe('470010');
    });

    it('returns null for unknown or empty banks', () => {
        expect(lookupBranchCode('Bank of Nowhere')).toBeNull();
        expect(lookupBranchCode('')).toBeNull();
        expect(lookupBranchCode(null)).toBeNull();
    });

    it('every bank in the list resolves to its own code', () => {
        for (const b of SA_BANKS) expect(lookupBranchCode(b.name)).toBe(b.branchCode);
    });
});

describe('calcNumInstalments — total ÷ monthly', () => {
    it('divides evenly', () => {
        expect(calcNumInstalments(5000, 500)).toBe(10);
    });
    it('rounds up so the full balance is covered', () => {
        expect(calcNumInstalments(5500, 500)).toBe(11);
        expect(calcNumInstalments(5250, 500)).toBe(11);
    });
    it('handles string inputs and currency formatting', () => {
        expect(calcNumInstalments('R 6,000.00', '500')).toBe(12);
    });
    it('returns null for invalid input', () => {
        expect(calcNumInstalments(5000, 0)).toBeNull();
        expect(calcNumInstalments(0, 500)).toBeNull();
        expect(calcNumInstalments(null, 500)).toBeNull();
    });
});

describe('calcTotalFromInstalments — count × monthly', () => {
    it('multiplies', () => {
        expect(calcTotalFromInstalments(12, 500)).toBe(6000);
        expect(calcTotalFromInstalments(6, 750.5)).toBe(4503);
    });
    it('truncates fractional instalment counts', () => {
        expect(calcTotalFromInstalments(10.9, 100)).toBe(1000);
    });
    it('returns null for invalid input', () => {
        expect(calcTotalFromInstalments(0, 500)).toBeNull();
        expect(calcTotalFromInstalments(12, null)).toBeNull();
    });
});

describe('calcMonthlyFromTotal — total ÷ count', () => {
    it('divides and rounds to cents', () => {
        expect(calcMonthlyFromTotal(6000, 12)).toBe(500);
        expect(calcMonthlyFromTotal(1000, 3)).toBe(333.33);
    });
});

describe('calcLastCollectionDate', () => {
    it('first instalment counts as instalment 1 (12 monthly → +11 months)', () => {
        expect(calcLastCollectionDate('2026-01-15', 12, 'MONTHLY')).toBe('2026-12-15');
    });
    it('a single instalment lands on the first date', () => {
        expect(calcLastCollectionDate('2026-03-01', 1, 'MONTHLY')).toBe('2026-03-01');
    });
    it('clamps to the end of short months', () => {
        // 31 Jan + 1 month → 28 Feb (2026 is not a leap year)
        expect(calcLastCollectionDate('2026-01-31', 2, 'MONTHLY')).toBe('2026-02-28');
    });
    it('supports weekly frequency', () => {
        expect(calcLastCollectionDate('2026-01-01', 4, 'WEEKLY')).toBe('2026-01-22');
    });
    it('returns null without a first date or count', () => {
        expect(calcLastCollectionDate(null, 12)).toBeNull();
        expect(calcLastCollectionDate('2026-01-15', 0)).toBeNull();
    });
});

describe('deriveMandateTerms — reconciliation', () => {
    it('total + monthly → number of instalments', () => {
        const r = deriveMandateTerms({ totalAmount: 6000, monthlyInstalment: 500 }, 'totalAmount');
        expect(r.numInstalments).toBe(12);
    });

    it('count + monthly → total', () => {
        const r = deriveMandateTerms({ numInstalments: 10, monthlyInstalment: 500 }, 'numInstalments');
        expect(r.totalAmount).toBe(5000);
    });

    it('editing monthly recomputes the instalment count, preserving the agreed total', () => {
        const r = deriveMandateTerms({ totalAmount: 6000, monthlyInstalment: 1000 }, 'monthlyInstalment');
        expect(r.numInstalments).toBe(6);
        expect(r.totalAmount).toBe(6000);
    });

    it('count + first date → last collection date', () => {
        const r = deriveMandateTerms(
            { numInstalments: 12, monthlyInstalment: 500, firstCollectionDate: '2026-01-15' },
            'firstCollectionDate',
        );
        expect(r.lastCollectionDate).toBe('2026-12-15');
        expect(r.totalAmount).toBe(6000);
    });

    it('fills the single missing triangle value on initial load (no justEdited)', () => {
        const r = deriveMandateTerms({ totalAmount: 9000, monthlyInstalment: 750 });
        expect(r.numInstalments).toBe(12);
    });

    it('does not overwrite the field the user just edited', () => {
        // User typed a count of 8 even though 6000/500 = 12; keep their count, recompute total.
        const r = deriveMandateTerms({ totalAmount: 6000, monthlyInstalment: 500, numInstalments: 8 }, 'numInstalments');
        expect(r.numInstalments).toBe(8);
        expect(r.totalAmount).toBe(4000);
    });
});
