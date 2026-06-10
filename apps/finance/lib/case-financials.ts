// Pure financial summary for a case — kept free of Prisma/Next so it is unit-testable.

export type PaymentLike = {
    amount: number | string;
    status: string;
};

export type InvoiceLike = {
    total: number | string;
    status: string;
};

export type CaseFinancialSummary = {
    serviceFee: number | null;
    totalPaid: number;
    /** serviceFee - totalPaid, floored at 0. Null when no fee is set. */
    outstanding: number | null;
    /** Amount collected beyond the agreed fee. 0 when within the fee or no fee set. */
    overCollected: number;
    /** 0–100, capped at 100. Null when no fee is set. */
    percentCollected: number | null;
    paymentCount: number;
    invoicedTotal: number;
    invoiceCount: number;
};

const COUNTED_PAYMENT_STATUSES = new Set(['COMPLETED']);
const COUNTED_INVOICE_STATUSES = new Set(['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE']);

export function summariseCaseFinancials(input: {
    serviceFee: number | string | null;
    payments: PaymentLike[];
    invoices: InvoiceLike[];
}): CaseFinancialSummary {
    const serviceFee = input.serviceFee === null ? null : Number(input.serviceFee);

    const counted = input.payments.filter(p => COUNTED_PAYMENT_STATUSES.has(p.status));
    const totalPaid = counted.reduce((sum, p) => sum + Number(p.amount), 0);

    const invoicesCounted = input.invoices.filter(i => COUNTED_INVOICE_STATUSES.has(i.status));
    const invoicedTotal = invoicesCounted.reduce((sum, i) => sum + Number(i.total), 0);

    const hasFee = serviceFee !== null && serviceFee > 0;

    return {
        serviceFee,
        totalPaid: round2(totalPaid),
        outstanding: hasFee ? round2(Math.max(0, serviceFee - totalPaid)) : null,
        overCollected: hasFee ? round2(Math.max(0, totalPaid - serviceFee)) : 0,
        percentCollected: hasFee ? Math.min(100, Math.round((totalPaid / serviceFee) * 100)) : null,
        paymentCount: input.payments.length,
        invoicedTotal: round2(invoicedTotal),
        invoiceCount: input.invoices.length,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function formatRand(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(n);
}
