import { getStatusByCode } from '@zenowethu/shared-lib/src/statuses/statuses';

export type MoneyLike = number | { toNumber: () => number } | null | undefined;

export type PortalCommissionInput = {
    isEligible: boolean;
    isPaid: boolean;
    commissionAmount: MoneyLike;
};

export function toPortalNumber(value: MoneyLike): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const numeric = value.toNumber();
    return Number.isFinite(numeric) ? numeric : 0;
}

export function maskConsumerName(firstName?: string | null, lastName?: string | null): string {
    const firstInitial = firstName?.trim().charAt(0).toUpperCase();
    const cleanLastName = lastName?.trim();

    if (firstInitial && cleanLastName) return `${firstInitial}. ${cleanLastName}`;
    if (cleanLastName) return cleanLastName;
    if (firstInitial) return `${firstInitial}.`;
    return 'Referral client';
}

export function maskAccountNumber(accountNumber?: string | null): string | null {
    const clean = accountNumber?.replace(/\s+/g, '');
    if (!clean) return null;
    if (clean.length <= 4) return clean;
    return `${'*'.repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

export function portalCommissionStatus(input: {
    isEligible: boolean;
    isPaid: boolean;
    paymentRef?: string | null;
}): 'Paid' | 'Ready for payout' | 'In progress' {
    if (input.isPaid || input.paymentRef) return 'Paid';
    if (input.isEligible) return 'Ready for payout';
    return 'In progress';
}

export function portalStageLabel(stage?: string | null): string {
    const labels: Record<string, string> = {
        NEW_LEAD: 'New referral',
        ADMIN_FEE_PAID: 'Admin fee paid',
        QUOTE_SUBMITTED: 'Quote submitted',
        QUOTE_ACCEPTED: 'Quote accepted',
        DEPOSIT_PAID: 'Deposit paid',
        PAYING_INSTALMENTS: 'Paying instalments',
        UP_TO_DATE: 'Up to date',
        ARREARS_1M: 'Payment follow-up',
        ARREARS_2M: 'Payment follow-up',
        ARREARS_3M: 'Payment follow-up',
        ARREARS_4M_PLUS: 'Payment follow-up',
        HANDED_OVER: 'Under review',
        SETTLED: 'Settled',
    };

    if (!stage) return 'In progress';
    return labels[stage]
        ?? getStatusByCode(stage)?.name
        ?? stage
            .toLowerCase()
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
}

/**
 * Referrer-facing colour tone for a referral's stage or case status.
 * - settled: fees fully paid — the happy end state
 * - completed: the work is done but payment is still outstanding
 * - progress: we have started working the file (anything from "Requested via DHS" onwards)
 * - detour: we hit a stumbling block, but we are working through it
 * - attention: overdue — needs immediate action
 * - lost: withdrawn or cancelled
 * - neutral: beginning stages / unknown
 */
export type PortalStatusTone =
    | 'settled'
    | 'completed'
    | 'progress'
    | 'detour'
    | 'attention'
    | 'lost'
    | 'neutral';

// Commission stage codes (RefStage) that do not exist as workflow statuses,
// plus stumbling-block codes that must read as detours regardless of the
// workflow category they sit in.
const STAGE_TONES: Record<string, PortalStatusTone> = {
    SETTLED: 'settled',
    SETTLED_SUCCESS: 'settled',
    ADMIN_FEE_PAID: 'progress',
    QUOTE_SUBMITTED: 'progress',
    QUOTE_ACCEPTED: 'progress',
    DEPOSIT_PAID: 'progress',
    PAYING_INSTALMENTS: 'progress',
    UP_TO_DATE: 'progress',
    ARREARS_1M: 'detour',
    ARREARS_2M: 'detour',
    ARREARS_3M: 'detour',
    ARREARS_4M_PLUS: 'detour',
    HANDED_OVER: 'detour',
    COLLECTION_HANDED_OVER: 'detour',
};

const CATEGORY_TONES: Record<string, PortalStatusTone> = {
    SETTLED: 'settled',
    COMPLETED: 'completed',
    IN_PROGRESS: 'progress',
    ADVANCED: 'progress',
    ADVANCED_PROGRESS: 'progress',
    PAYING: 'progress',
    DETOUR: 'detour',
    ADVANCED_DETOUR: 'detour',
    OVERDUE: 'attention',
    LOST: 'lost',
    BEGINNING: 'neutral',
};

export function portalStatusTone(stageOrStatus?: string | null): PortalStatusTone {
    if (!stageOrStatus) return 'neutral';
    const stageTone = STAGE_TONES[stageOrStatus];
    if (stageTone) return stageTone;
    const category = getStatusByCode(stageOrStatus)?.category;
    return (category && CATEGORY_TONES[category]) || 'neutral';
}

export type DiscountPartnerReferralInput = {
    createdAt: Date | string;
    stage?: string | null;
    /** Raw case workflow status — used when no commission stage exists. */
    caseStatus?: string | null;
    /** Whether work is completed */
    isCompleted?: boolean;
    /** Whether payment is settled */
    isSettled?: boolean;
    /** When the referral reached a settled state — used to bucket settlements by month. */
    settledAt?: Date | string | null;
    /** When the work was completed — used to bucket completions by month. */
    completedAt?: Date | string | null;
    quoteTotal: number | null;
    /** Best-known date the quote basis was established (acceptance date, quote date, or case creation for service fees). */
    quoteDate?: Date | string | null;
    /** Completed client payments only. */
    payments: { amount: number; date: Date | string }[];
};

export type DiscountPartnerTotals = {
    totalReferrals: number;
    referralsThisMonth: number;
    referralsLastMonth: number;
    totalInProgress: number;
    inProgressThisMonth: number;
    inProgressLastMonth: number;
    totalSettledNotCompleted: number;
    settledNotCompletedThisMonth: number;
    settledNotCompletedLastMonth: number;
    totalCompletedNotSettled: number;
    completedNotSettledThisMonth: number;
    completedNotSettledLastMonth: number;
    totalBothSettledAndCompleted: number;
    bothSettledAndCompletedThisMonth: number;
    bothSettledAndCompletedLastMonth: number;
    totalLost: number;
    lostThisMonth: number;
    lostLastMonth: number;
    totalQuoted: number;
    quotedThisMonth: number;
    quotedLastMonth: number;
    totalPaid: number;
    paidThisMonth: number;
    paidLastMonth: number;
    totalSettledPaid: number;
    settledPaidThisMonth: number;
    settledPaidLastMonth: number;
    totalCompletedOutstanding: number;
    completedOutstandingThisMonth: number;
    completedOutstandingLastMonth: number;
    totalExpectedRevenue: number;
    expectedRevenueThisMonth: number;
    expectedRevenueLastMonth: number;
};

/** True when the value falls in the calendar month `monthOffset` months before `now` (0 = this month, 1 = last month). */
export function isInCalendarMonth(
    value: Date | string | null | undefined,
    now: Date,
    monthOffset: 0 | 1 = 0,
): boolean {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Dashboard totals for a discount partner: referral flow, completions,
 *  settlements, and the quote/payment money their referred clients generated —
 *  all-time plus this and last calendar month. */
export function calculateDiscountPartnerTotals(
    referrals: DiscountPartnerReferralInput[],
    now: Date = new Date(),
): DiscountPartnerTotals {
    return referrals.reduce<DiscountPartnerTotals>(
        (totals, referral) => {
            const isCompleted = referral.isCompleted ?? false;
            const isSettled = referral.isSettled ?? false;
            const lost = portalStatusTone(referral.caseStatus ?? referral.stage) === 'lost';
            const quoted = referral.quoteTotal != null && referral.quoteTotal > 0;
            const paid = referral.payments.reduce((sum, payment) => sum + payment.amount, 0);
            const paidThisMonth = referral.payments
                .filter((payment) => isInCalendarMonth(payment.date, now))
                .reduce((sum, payment) => sum + payment.amount, 0);
            const paidLastMonth = referral.payments
                .filter((payment) => isInCalendarMonth(payment.date, now, 1))
                .reduce((sum, payment) => sum + payment.amount, 0);

            const referralOutstanding = referral.quoteTotal != null ? Math.max(0, referral.quoteTotal - paid) : 0;
            const inProgress = !isSettled && !isCompleted && !lost;
            const settledNotCompleted = isSettled && !isCompleted;
            const completedNotSettled = isCompleted && !isSettled;
            const bothSettledAndCompleted = isSettled && isCompleted;
            const completedOutstanding = completedNotSettled ? referralOutstanding : 0;
            const settledPaid = isSettled ? paid : 0;
            const settledPaidThisMonth = isSettled ? paidThisMonth : 0;
            const settledPaidLastMonth = isSettled ? paidLastMonth : 0;

            return {
                totalReferrals: totals.totalReferrals + 1,
                referralsThisMonth: totals.referralsThisMonth + (isInCalendarMonth(referral.createdAt, now) ? 1 : 0),
                referralsLastMonth: totals.referralsLastMonth + (isInCalendarMonth(referral.createdAt, now, 1) ? 1 : 0),
                totalInProgress: totals.totalInProgress + (inProgress ? 1 : 0),
                inProgressThisMonth: totals.inProgressThisMonth + (inProgress && isInCalendarMonth(referral.createdAt, now) ? 1 : 0),
                inProgressLastMonth: totals.inProgressLastMonth + (inProgress && isInCalendarMonth(referral.createdAt, now, 1) ? 1 : 0),
                totalSettledNotCompleted: totals.totalSettledNotCompleted + (settledNotCompleted ? 1 : 0),
                settledNotCompletedThisMonth: totals.settledNotCompletedThisMonth + (settledNotCompleted && isInCalendarMonth(referral.settledAt, now) ? 1 : 0),
                settledNotCompletedLastMonth: totals.settledNotCompletedLastMonth + (settledNotCompleted && isInCalendarMonth(referral.settledAt, now, 1) ? 1 : 0),
                totalCompletedNotSettled: totals.totalCompletedNotSettled + (completedNotSettled ? 1 : 0),
                completedNotSettledThisMonth: totals.completedNotSettledThisMonth + (completedNotSettled && isInCalendarMonth(referral.completedAt, now) ? 1 : 0),
                completedNotSettledLastMonth: totals.completedNotSettledLastMonth + (completedNotSettled && isInCalendarMonth(referral.completedAt, now, 1) ? 1 : 0),
                totalBothSettledAndCompleted: totals.totalBothSettledAndCompleted + (bothSettledAndCompleted ? 1 : 0),
                bothSettledAndCompletedThisMonth: totals.bothSettledAndCompletedThisMonth + (bothSettledAndCompleted && isInCalendarMonth(referral.completedAt, now) ? 1 : 0),
                bothSettledAndCompletedLastMonth: totals.bothSettledAndCompletedLastMonth + (bothSettledAndCompleted && isInCalendarMonth(referral.completedAt, now, 1) ? 1 : 0),
                totalLost: totals.totalLost + (lost ? 1 : 0),
                lostThisMonth: totals.lostThisMonth + (lost && isInCalendarMonth(referral.createdAt, now) ? 1 : 0),
                lostLastMonth: totals.lostLastMonth + (lost && isInCalendarMonth(referral.createdAt, now, 1) ? 1 : 0),
                totalQuoted: roundMoney(totals.totalQuoted + (quoted ? referral.quoteTotal! : 0)),
                quotedThisMonth: roundMoney(totals.quotedThisMonth + (quoted && isInCalendarMonth(referral.quoteDate, now) ? referral.quoteTotal! : 0)),
                quotedLastMonth: roundMoney(totals.quotedLastMonth + (quoted && isInCalendarMonth(referral.quoteDate, now, 1) ? referral.quoteTotal! : 0)),
                totalPaid: roundMoney(totals.totalPaid + paid),
                paidThisMonth: roundMoney(totals.paidThisMonth + paidThisMonth),
                paidLastMonth: roundMoney(totals.paidLastMonth + paidLastMonth),
                totalSettledPaid: roundMoney(totals.totalSettledPaid + settledPaid),
                settledPaidThisMonth: roundMoney(totals.settledPaidThisMonth + settledPaidThisMonth),
                settledPaidLastMonth: roundMoney(totals.settledPaidLastMonth + settledPaidLastMonth),
                totalCompletedOutstanding: roundMoney(totals.totalCompletedOutstanding + completedOutstanding),
                completedOutstandingThisMonth: roundMoney(totals.completedOutstandingThisMonth + (completedNotSettled && isInCalendarMonth(referral.completedAt, now) ? completedOutstanding : 0)),
                completedOutstandingLastMonth: roundMoney(totals.completedOutstandingLastMonth + (completedNotSettled && isInCalendarMonth(referral.completedAt, now, 1) ? completedOutstanding : 0)),
                totalExpectedRevenue: roundMoney(totals.totalExpectedRevenue + referralOutstanding),
                expectedRevenueThisMonth: roundMoney(totals.expectedRevenueThisMonth + (isInCalendarMonth(referral.createdAt, now) ? referralOutstanding : 0)),
                expectedRevenueLastMonth: roundMoney(totals.expectedRevenueLastMonth + (isInCalendarMonth(referral.createdAt, now, 1) ? referralOutstanding : 0)),
            };
        },
        {
            totalReferrals: 0,
            referralsThisMonth: 0,
            referralsLastMonth: 0,
            totalInProgress: 0,
            inProgressThisMonth: 0,
            inProgressLastMonth: 0,
            totalSettledNotCompleted: 0,
            settledNotCompletedThisMonth: 0,
            settledNotCompletedLastMonth: 0,
            totalCompletedNotSettled: 0,
            completedNotSettledThisMonth: 0,
            completedNotSettledLastMonth: 0,
            totalBothSettledAndCompleted: 0,
            bothSettledAndCompletedThisMonth: 0,
            bothSettledAndCompletedLastMonth: 0,
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
            totalCompletedOutstanding: 0,
            completedOutstandingThisMonth: 0,
            completedOutstandingLastMonth: 0,
            totalExpectedRevenue: 0,
            expectedRevenueThisMonth: 0,
            expectedRevenueLastMonth: 0,
        },
    );
}

/** Case.services is stored as a JSON string array — parse defensively. */
export function parseCaseServices(services?: string | null): string[] {
    if (!services) return [];
    try {
        const parsed: unknown = JSON.parse(services);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    } catch {
        return [];
    }
}

const DOCUMENT_LABEL_ACRONYMS = new Set(['ID', 'POA', 'DHS', 'NCR', 'NCT', 'XDS']);

/** Human label for a Document.type code, e.g. ID_DOCUMENT → "ID Document". */
export function formatDocumentTypeLabel(type?: string | null): string {
    const parts = (type ?? '').split('_').filter(Boolean);
    if (parts.length === 0) return 'Document';
    return parts
        .map((part) => {
            const upper = part.toUpperCase();
            if (DOCUMENT_LABEL_ACRONYMS.has(upper)) return upper;
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
}

// Case discussion between a referrer and staff is stored as CaseComment rows
// with this type — visible in the staff activity feed and the referrer portal.
export const REFERRER_COMMENT_TYPE = 'REFERRER';

export type PortalCommentSource = {
    id: string;
    content: string;
    createdAt: Date | string;
    user: { firstName: string; lastName: string; userType: string | null };
};

export type PortalComment = {
    id: string;
    content: string;
    createdAt: Date | string;
    authorName: string;
    fromReferrer: boolean;
};

export function toPortalComment(comment: PortalCommentSource): PortalComment {
    const fromReferrer = comment.user.userType === 'REFERRER';
    const lastInitial = comment.user.lastName?.trim().charAt(0).toUpperCase();
    return {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        authorName: fromReferrer
            ? comment.user.firstName
            : `${comment.user.firstName}${lastInitial ? ` ${lastInitial}.` : ''} — Zenowethu`,
        fromReferrer,
    };
}

export function calculatePortalCommissionTotals(commissions: PortalCommissionInput[]) {
    return commissions.reduce(
        (totals, commission) => {
            const amount = toPortalNumber(commission.commissionAmount);
            const earned = commission.isEligible || commission.isPaid;

            return {
                totalReferrals: totals.totalReferrals + 1,
                commissionEarned: totals.commissionEarned + (earned ? amount : 0),
                commissionPending: totals.commissionPending + (commission.isEligible && !commission.isPaid ? amount : 0),
                commissionPaid: totals.commissionPaid + (commission.isPaid ? amount : 0),
            };
        },
        {
            totalReferrals: 0,
            commissionEarned: 0,
            commissionPending: 0,
            commissionPaid: 0,
        },
    );
}
