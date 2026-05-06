import type { ReferrerCommissionStage } from '@prisma/client';

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
