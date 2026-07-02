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
