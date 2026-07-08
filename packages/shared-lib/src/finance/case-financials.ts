// Pure financial summaries shared by Finance and Credo.

export type PaymentLike = {
    amount: number | string;
    status: string;
};

export type InvoiceLike = {
    total: number | string;
    status: string;
    type?: string;
    acceptedAt?: Date | string | null;
    convertedToInvoiceId?: string | null;
};

export type CaseFinancialSummary = {
    serviceFee: number | null;
    feeBasisTotal: number | null;
    feeBasisSource: 'CASE_SERVICE_FEE' | 'ACCEPTED_QUOTE' | null;
    totalPaid: number;
    outstanding: number | null;
    feeBasisOutstanding: number | null;
    overCollected: number;
    percentCollected: number | null;
    feeBasisPercentCollected: number | null;
    paymentCount: number;
    invoicedTotal: number;
    invoiceCount: number;
    acceptedQuotesTotal: number;
    acceptedQuoteCount: number;
    quoteBalance: number | null;
    quoteOverpaid: number;
};

const COUNTED_PAYMENT_STATUSES = new Set(['COMPLETED']);
const COUNTED_INVOICE_STATUSES = new Set(['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE']);
const NON_PAYABLE_STATUSES = new Set(['CANCELLED', 'REJECTED']);

export function isAcceptedQuote(invoice: InvoiceLike): boolean {
    return invoice.type === 'QUOTE' && (invoice.status === 'ACCEPTED' || Boolean(invoice.acceptedAt));
}

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

    const acceptedQuotes = input.invoices.filter(isAcceptedQuote);
    const acceptedQuotesTotal = acceptedQuotes.reduce((sum, i) => sum + Number(i.total), 0);

    const hasFee = serviceFee !== null && serviceFee > 0;
    const hasAcceptedQuotes = acceptedQuotes.length > 0;
    const feeBasisTotal = hasFee ? serviceFee : hasAcceptedQuotes ? acceptedQuotesTotal : null;
    const feeBasisSource = hasFee ? 'CASE_SERVICE_FEE' : hasAcceptedQuotes ? 'ACCEPTED_QUOTE' : null;
    const hasFeeBasis = feeBasisTotal !== null && feeBasisTotal > 0;

    return {
        serviceFee,
        feeBasisTotal: feeBasisTotal === null ? null : round2(feeBasisTotal),
        feeBasisSource,
        totalPaid: round2(totalPaid),
        outstanding: hasFeeBasis ? round2(Math.max(0, feeBasisTotal - totalPaid)) : null,
        feeBasisOutstanding: hasFeeBasis ? round2(Math.max(0, feeBasisTotal - totalPaid)) : null,
        overCollected: hasFee ? round2(Math.max(0, totalPaid - serviceFee)) : 0,
        percentCollected: hasFee ? Math.min(100, Math.round((totalPaid / serviceFee) * 100)) : null,
        feeBasisPercentCollected: hasFeeBasis ? Math.min(100, Math.round((totalPaid / feeBasisTotal) * 100)) : null,
        paymentCount: input.payments.length,
        invoicedTotal: round2(invoicedTotal),
        invoiceCount: input.invoices.length,
        acceptedQuotesTotal: round2(acceptedQuotesTotal),
        acceptedQuoteCount: acceptedQuotes.length,
        quoteBalance: hasAcceptedQuotes ? round2(Math.max(0, acceptedQuotesTotal - totalPaid)) : null,
        quoteOverpaid: hasAcceptedQuotes ? round2(Math.max(0, totalPaid - acceptedQuotesTotal)) : 0,
    };
}

export function summariseClientFinancials(input: {
    payments: PaymentLike[];
    invoices: InvoiceLike[];
}): {
    totalExpected: number;
    totalCollected: number;
    balanceDue: number;
    acceptedQuoteCount: number;
    invoiceCount: number;
} {
    const countedPayments = input.payments.filter(p => COUNTED_PAYMENT_STATUSES.has(p.status));
    const totalCollected = countedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const activeInvoices = input.invoices.filter(i => i.type === 'INVOICE' && !NON_PAYABLE_STATUSES.has(i.status));
    const openAcceptedQuotes = input.invoices.filter(i =>
        isAcceptedQuote(i) &&
        !NON_PAYABLE_STATUSES.has(i.status) &&
        !i.convertedToInvoiceId
    );

    const totalExpected = [...activeInvoices, ...openAcceptedQuotes]
        .reduce((sum, i) => sum + Number(i.total), 0);

    return {
        totalExpected: round2(totalExpected),
        totalCollected: round2(totalCollected),
        balanceDue: round2(Math.max(0, totalExpected - totalCollected)),
        acceptedQuoteCount: openAcceptedQuotes.length,
        invoiceCount: activeInvoices.length,
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
