import { describe, it, expect } from 'vitest';
import {
    calculateCommissionAmount,
    VOLUME_TIER_LOW_AMOUNT,
    VOLUME_TIER_HIGH_AMOUNT,
    VOLUME_TIER_THRESHOLD,
    getCommissionStageForCaseStatus,
    isCommissionEligible,
    referrerEarnsCommission,
    REFERRER_TYPES,
} from './referrer-commission';

// ---------------------------------------------------------------------------
// calculateCommissionAmount
// ---------------------------------------------------------------------------

describe('calculateCommissionAmount', () => {
    // --- FIXED type ---
    describe('FIXED type', () => {
        it('returns the configured fixed amount', () => {
            expect(calculateCommissionAmount('FIXED', 500, 3)).toBe(500);
            expect(calculateCommissionAmount('FIXED', 300, 15)).toBe(300);
            expect(calculateCommissionAmount('FIXED', 200, 0)).toBe(200);
        });

        it('accepts a Prisma Decimal-like object (has .toNumber())', () => {
            const decimal = { toNumber: () => 350 };
            expect(calculateCommissionAmount('FIXED', decimal, 5)).toBe(350);
        });

        it('falls back to VOLUME_TIER_LOW_AMOUNT when fixedAmount is null', () => {
            expect(calculateCommissionAmount('FIXED', null, 99)).toBe(VOLUME_TIER_LOW_AMOUNT);
            expect(calculateCommissionAmount('FIXED', undefined, 1)).toBe(VOLUME_TIER_LOW_AMOUNT);
        });

        it('defaults to FIXED when commissionType is null or undefined', () => {
            expect(calculateCommissionAmount(null, 300, 5)).toBe(300);
            expect(calculateCommissionAmount(undefined, 200, 20)).toBe(200);
        });
    });

    // --- VOLUME_BASED type ---
    describe('VOLUME_BASED type', () => {
        it('returns low tier (R200) when referral count is below threshold', () => {
            expect(calculateCommissionAmount('VOLUME_BASED', null, 1)).toBe(VOLUME_TIER_LOW_AMOUNT);
            expect(calculateCommissionAmount('VOLUME_BASED', null, 9)).toBe(VOLUME_TIER_LOW_AMOUNT);
            expect(calculateCommissionAmount('VOLUME_BASED', null, VOLUME_TIER_THRESHOLD - 1)).toBe(VOLUME_TIER_LOW_AMOUNT);
        });

        it('returns high tier (R300) at exactly the threshold', () => {
            expect(calculateCommissionAmount('VOLUME_BASED', null, VOLUME_TIER_THRESHOLD)).toBe(VOLUME_TIER_HIGH_AMOUNT);
        });

        it('returns high tier (R300) above the threshold', () => {
            expect(calculateCommissionAmount('VOLUME_BASED', null, 11)).toBe(VOLUME_TIER_HIGH_AMOUNT);
            expect(calculateCommissionAmount('VOLUME_BASED', null, 50)).toBe(VOLUME_TIER_HIGH_AMOUNT);
        });

        it('ignores fixedAmount when type is VOLUME_BASED', () => {
            // Even if a fixed amount is set, volume rule wins
            expect(calculateCommissionAmount('VOLUME_BASED', 500, 9)).toBe(VOLUME_TIER_LOW_AMOUNT);
            expect(calculateCommissionAmount('VOLUME_BASED', 500, 10)).toBe(VOLUME_TIER_HIGH_AMOUNT);
        });
    });
});

// ---------------------------------------------------------------------------
// getCommissionStageForCaseStatus
// ---------------------------------------------------------------------------

describe('getCommissionStageForCaseStatus', () => {
    it('maps PAID_R350 to ADMIN_FEE_PAID', () => {
        expect(getCommissionStageForCaseStatus('PAID_R350')).toBe('ADMIN_FEE_PAID');
    });

    it('maps DEPOSIT_PAID to DEPOSIT_PAID', () => {
        expect(getCommissionStageForCaseStatus('DEPOSIT_PAID')).toBe('DEPOSIT_PAID');
    });

    it('maps COMPLETED to SETTLED', () => {
        expect(getCommissionStageForCaseStatus('COMPLETED')).toBe('SETTLED');
    });

    it('returns null for unknown statuses', () => {
        expect(getCommissionStageForCaseStatus('UNKNOWN_STATUS')).toBeNull();
        expect(getCommissionStageForCaseStatus('')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// isCommissionEligible
// ---------------------------------------------------------------------------

describe('isCommissionEligible', () => {
    it('returns true for eligible stages', () => {
        expect(isCommissionEligible('DEPOSIT_PAID')).toBe(true);
        expect(isCommissionEligible('PAYING_INSTALMENTS')).toBe(true);
        expect(isCommissionEligible('UP_TO_DATE')).toBe(true);
        expect(isCommissionEligible('SETTLED')).toBe(true);
    });

    it('returns false for non-eligible stages', () => {
        expect(isCommissionEligible('NEW_LEAD')).toBe(false);
        expect(isCommissionEligible('ADMIN_FEE_PAID')).toBe(false);
        expect(isCommissionEligible('QUOTE_SUBMITTED')).toBe(false);
        expect(isCommissionEligible('ARREARS_1M')).toBe(false);
        expect(isCommissionEligible('HANDED_OVER')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// referrerEarnsCommission
// ---------------------------------------------------------------------------

describe('referrerEarnsCommission', () => {
    it('returns true for COMMISSION referrers', () => {
        expect(referrerEarnsCommission('COMMISSION')).toBe(true);
    });

    it('returns false for DISCOUNT referrers', () => {
        expect(referrerEarnsCommission('DISCOUNT')).toBe(false);
    });

    it('treats unknown or missing types as COMMISSION (historical default)', () => {
        expect(referrerEarnsCommission(null)).toBe(true);
        expect(referrerEarnsCommission(undefined)).toBe(true);
        expect(referrerEarnsCommission('')).toBe(true);
        expect(referrerEarnsCommission('SOMETHING_ELSE')).toBe(true);
    });

    it('exposes both referrer types', () => {
        expect(REFERRER_TYPES).toEqual(['COMMISSION', 'DISCOUNT']);
    });
});
