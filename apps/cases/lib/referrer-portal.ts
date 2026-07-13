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
    return labels[stage] ?? stage
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type DiscountPartnerReferralInput = {
    createdAt: Date | string;
    stage?: string | null;
    /** When the referral last changed stage — used to date "settled" events. */
    stageUpdatedAt?: Date | string | null;
    quoteTotal: number | null;
    /** Best-known date the quote basis was established (acceptance date, quote date, or case creation for service fees). */
    quoteDate?: Date | string | null;
    /** Completed client payments only. */
    payments: { amount: number; date: Date | string }[];
};

export type DiscountPartnerTotals = {
    totalReferrals: number;
    referralsLast30Days: number;
    totalSettled: number;
    settledLast30Days: number;
    totalQuoted: number;
    quotedLast30Days: number;
    totalPaid: number;
    paidLast30Days: number;
};

function isWithinLast30Days(value: Date | string | null | undefined, now: Date): boolean {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    return time >= now.getTime() - THIRTY_DAYS_MS && time <= now.getTime();
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Dashboard totals for a discount partner: referral flow, settlements, and the
 *  quote/payment money their referred clients generated — overall and in the
 *  last 30 days. */
export function calculateDiscountPartnerTotals(
    referrals: DiscountPartnerReferralInput[],
    now: Date = new Date(),
): DiscountPartnerTotals {
    return referrals.reduce<DiscountPartnerTotals>(
        (totals, referral) => {
            const settled = referral.stage === 'SETTLED';
            const quoted = referral.quoteTotal != null && referral.quoteTotal > 0;
            const paid = referral.payments.reduce((sum, payment) => sum + payment.amount, 0);
            const paid30 = referral.payments
                .filter((payment) => isWithinLast30Days(payment.date, now))
                .reduce((sum, payment) => sum + payment.amount, 0);

            return {
                totalReferrals: totals.totalReferrals + 1,
                referralsLast30Days: totals.referralsLast30Days + (isWithinLast30Days(referral.createdAt, now) ? 1 : 0),
                totalSettled: totals.totalSettled + (settled ? 1 : 0),
                settledLast30Days: totals.settledLast30Days + (settled && isWithinLast30Days(referral.stageUpdatedAt, now) ? 1 : 0),
                totalQuoted: roundMoney(totals.totalQuoted + (quoted ? referral.quoteTotal! : 0)),
                quotedLast30Days: roundMoney(totals.quotedLast30Days + (quoted && isWithinLast30Days(referral.quoteDate, now) ? referral.quoteTotal! : 0)),
                totalPaid: roundMoney(totals.totalPaid + paid),
                paidLast30Days: roundMoney(totals.paidLast30Days + paid30),
            };
        },
        {
            totalReferrals: 0,
            referralsLast30Days: 0,
            totalSettled: 0,
            settledLast30Days: 0,
            totalQuoted: 0,
            quotedLast30Days: 0,
            totalPaid: 0,
            paidLast30Days: 0,
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
