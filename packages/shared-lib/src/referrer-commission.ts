import type { ReferrerCommissionStage } from '@zenowethu/database';

// ---------------------------------------------------------------------------
// Referrer Types
// ---------------------------------------------------------------------------

/** COMMISSION: the referrer's clients pay full price and the referrer earns a
 *  payout per referral (per the commission tier below).
 *  DISCOUNT: the referrer's clients get discounted pricing
 *  (Referrer.clientDiscountPercent) and the referrer earns no commission.
 */
export type ReferrerType = 'COMMISSION' | 'DISCOUNT' | 'HYBRID';

export const REFERRER_TYPES: ReferrerType[] = ['COMMISSION', 'DISCOUNT', 'HYBRID'];

export const REFERRER_TYPE_LABELS: Record<ReferrerType, string> = {
    COMMISSION: 'Commission — clients pay full price, referrer earns per referral',
    DISCOUNT:   'Discount — clients get discounted pricing, no commission',
    HYBRID:     'Hybrid — clients get discounted pricing, referrer earns commission',
};

/** Unknown/legacy values are treated as COMMISSION (the historical default). */
export function referrerEarnsCommission(referrerType: string | null | undefined): boolean {
    return referrerType !== 'DISCOUNT';
}

// ---------------------------------------------------------------------------
// Commission Tier Types
// ---------------------------------------------------------------------------

/** FIXED: every referral pays a flat amount configured on the Referrer record.
 *  VOLUME_BASED: amount auto-scales with how many total cases the referrer has
 *  brought:  < 10 cases → R200 per referral,  ≥ 10 cases → R300 per referral.
 */
export type CommissionType = 'FIXED' | 'VOLUME_BASED';

export const COMMISSION_TYPES: CommissionType[] = ['FIXED', 'VOLUME_BASED'];

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
    FIXED:        'Fixed Amount',
    VOLUME_BASED: 'Volume-Based (≥10 → R300, <10 → R200)',
};

/** Volume tier thresholds */
export const VOLUME_TIER_LOW_AMOUNT  = 200;   // < 10 cases
export const VOLUME_TIER_HIGH_AMOUNT = 300;   // ≥ 10 cases
export const VOLUME_TIER_THRESHOLD   = 10;    // cases needed to reach high tier

// Case statuses that advance the commission stage
const STATUS_TO_COMMISSION_STAGE: Record<string, ReferrerCommissionStage> = {
    NEW_LEAD:        'NEW_LEAD',
    XDS_LEAD:        'NEW_LEAD',
    TOLD_R350:       'NEW_LEAD',
    WAITING_R350:    'NEW_LEAD',
    PAID_R350:       'ADMIN_FEE_PAID',
    FILE_PAID:       'ADMIN_FEE_PAID',
    QUOTED:          'QUOTE_SUBMITTED',
    QUOTE_ACCEPTED:  'QUOTE_ACCEPTED',
    DEPOSIT_PAID:    'DEPOSIT_PAID',
    PAYING:          'PAYING_INSTALMENTS',
    UP_TO_DATE:      'UP_TO_DATE',
    ARREARS_1M:      'ARREARS_1M',
    ARREARS_2M:      'ARREARS_2M',
    ARREARS_3M:      'ARREARS_3M',
    ARREARS_4M_PLUS: 'ARREARS_4M_PLUS',
    CL_HANDED_OVER:  'HANDED_OVER',
    COMPLETED:       'SETTLED',
    SETTLED:         'SETTLED',
    SETTLED_SUCCESS: 'SETTLED',
};

// Commission is payable once any of these stages is reached
const ELIGIBLE_STAGES = new Set<ReferrerCommissionStage>([
    'DEPOSIT_PAID',
    'PAYING_INSTALMENTS',
    'UP_TO_DATE',
    'SETTLED',
]);

export function getCommissionStageForCaseStatus(caseStatus: string): ReferrerCommissionStage | null {
    return STATUS_TO_COMMISSION_STAGE[caseStatus] ?? null;
}

export function isCommissionEligible(stage: ReferrerCommissionStage): boolean {
    return ELIGIBLE_STAGES.has(stage);
}

export const COMMISSION_STAGE_LABELS: Record<ReferrerCommissionStage, string> = {
    NEW_LEAD:          'New Lead',
    ADMIN_FEE_PAID:    'Admin Fee Paid',
    QUOTE_SUBMITTED:   'Quote Submitted',
    QUOTE_ACCEPTED:    'Quote Accepted',
    DEPOSIT_PAID:      'Deposit Paid',
    PAYING_INSTALMENTS:'Paying Instalments',
    UP_TO_DATE:        'Up to Date',
    ARREARS_1M:        '1 Month in Arrears',
    ARREARS_2M:        '2 Months in Arrears',
    ARREARS_3M:        '3 Months in Arrears',
    ARREARS_4M_PLUS:   '4+ Months in Arrears',
    HANDED_OVER:       'Handed Over',
    SETTLED:           'Settled',
};

/**
 * Auto-calculate the commission amount for a referral.
 *
 * @param commissionType  - 'FIXED' | 'VOLUME_BASED' (default: 'FIXED')
 * @param fixedAmount     - The configured fixed rand amount (used when FIXED)
 * @param totalReferralCount - Total cases this referrer has brought so far
 *                             (used when VOLUME_BASED to apply volume tier)
 * @returns Calculated rand amount as a number
 */
export function calculateCommissionAmount(
    commissionType: string | null | undefined,
    fixedAmount: number | { toNumber: () => number } | null | undefined,
    totalReferralCount: number,
): number {
    const type: CommissionType = (commissionType === 'VOLUME_BASED') ? 'VOLUME_BASED' : 'FIXED';

    if (type === 'VOLUME_BASED') {
        return totalReferralCount >= VOLUME_TIER_THRESHOLD
            ? VOLUME_TIER_HIGH_AMOUNT
            : VOLUME_TIER_LOW_AMOUNT;
    }

    // FIXED
    if (fixedAmount != null) {
        return typeof fixedAmount === 'number'
            ? fixedAmount
            : fixedAmount.toNumber();
    }

    // No fixed amount configured — safe default is the low-volume tier amount
    return VOLUME_TIER_LOW_AMOUNT;
}

// Ordered list for display (progress tracking)
export const COMMISSION_STAGE_ORDER: ReferrerCommissionStage[] = [
    'NEW_LEAD',
    'ADMIN_FEE_PAID',
    'QUOTE_SUBMITTED',
    'QUOTE_ACCEPTED',
    'DEPOSIT_PAID',
    'PAYING_INSTALMENTS',
    'UP_TO_DATE',
    'ARREARS_1M',
    'ARREARS_2M',
    'ARREARS_3M',
    'ARREARS_4M_PLUS',
    'HANDED_OVER',
    'SETTLED',
];
