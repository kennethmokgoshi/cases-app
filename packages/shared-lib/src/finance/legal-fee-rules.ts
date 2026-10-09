/**
 * Legal fees — business rules (pure, browser + server safe).
 *
 * Background
 * ----------
 * A consumer accepted via DHS with consumer status D3 or D4 must go to court, and
 * taking the file to court costs the consumer a legal fee (default R1,700 — the
 * Company Profile's `legalFeeAmount`) whether the application is single or joint.
 * Status A and C files have no legal fee.
 *
 * `Case.legalFeesStatus` tracks where that fee stands. The labels are stored as
 * free strings, so every comparison here is case/space-insensitive.
 */

export const LEGAL_FEES_STATUS = {
    NO_LEGAL_FEES: 'No Legal Fees',
    NOT_YET_TRANSFERRED: 'Not yet transferred',
    NO_ARRANGEMENT: 'No Arrangement yet',
    ARRANGEMENT_IN_PROGRESS: 'Arrangement in progress',
    NPR_CONSENT: 'NPR Consent',
    PR_FEES_CONSENT: 'PR Fees Consent',
    PAYING: 'Paying',
    AUTHORISED_PENDING: 'Authorised & Pending',
    CASH_FOCUS: 'Cash Focus',
    FEES_PAID_CASH: 'Fees Paid Cash',
    DEBITING: 'Debiting',
    DEBITED: 'Debited',
    REFUSED_TO_PAY: 'Refused to Pay',
    INVOICED_PENDING: 'Invoiced & Pending',
    SETTLED: 'Settled',
} as const;

/** Options for the Legal Fees Status dropdown, in display order. */
export const LEGAL_FEES_STATUS_OPTIONS: readonly string[] = [
    LEGAL_FEES_STATUS.NO_LEGAL_FEES,
    LEGAL_FEES_STATUS.NOT_YET_TRANSFERRED,
    LEGAL_FEES_STATUS.NO_ARRANGEMENT,
    LEGAL_FEES_STATUS.ARRANGEMENT_IN_PROGRESS,
    LEGAL_FEES_STATUS.NPR_CONSENT,
    LEGAL_FEES_STATUS.PR_FEES_CONSENT,
    LEGAL_FEES_STATUS.PAYING,
    LEGAL_FEES_STATUS.AUTHORISED_PENDING,
    LEGAL_FEES_STATUS.CASH_FOCUS,
    LEGAL_FEES_STATUS.FEES_PAID_CASH,
    LEGAL_FEES_STATUS.DEBITING,
    LEGAL_FEES_STATUS.DEBITED,
    LEGAL_FEES_STATUS.REFUSED_TO_PAY,
    LEGAL_FEES_STATUS.INVOICED_PENDING,
    LEGAL_FEES_STATUS.SETTLED,
];

const normalise = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Consumer status code from a stored DHS status:
 * "D4 - Under debt review with court order" → "D4"; empty → null.
 */
export function extractConsumerDhsCode(value: string | null | undefined): string | null {
    if (!value) return null;
    const code = value.trim().toUpperCase().split(/[\s\-–:]+/)[0];
    return code || null;
}

/**
 * Legal Fees Status values from which the system may still raise the invoice:
 * nothing recorded yet, the file was not transferred, or no arrangement exists.
 * Anything else (payroll consent, an arrangement in progress, already paying,
 * refused …) means a person has dealt with the fee — never override that.
 */
const INVOICE_ELIGIBLE_STATUSES = new Set([
    '',
    normalise(LEGAL_FEES_STATUS.NOT_YET_TRANSFERRED),
    normalise(LEGAL_FEES_STATUS.NO_ARRANGEMENT),
    normalise(LEGAL_FEES_STATUS.NO_LEGAL_FEES),
]);

export type LegalFeeSkipReason =
    | 'DHS_CODE_UNKNOWN'
    | 'LEGAL_FEES_ALREADY_HANDLED';

export type LegalFeeDecision =
    /** D3 / D4 and nothing handled yet — raise and send the invoice. */
    | { action: 'INVOICE' }
    /** A / C — no court, no legal fee. Record "No Legal Fees" where unset. */
    | { action: 'NO_LEGAL_FEES'; setStatus: boolean }
    | { action: 'SKIP'; reason: LegalFeeSkipReason };

/**
 * Decide what to do about the legal fee once a file is Accepted via DHS.
 * Callers must only invoke this for accepted files — an unaccepted file never
 * gets an invoice.
 */
export function decideLegalFeeAction(params: {
    consumerDhsStatus: string | null | undefined;
    legalFeesStatus: string | null | undefined;
}): LegalFeeDecision {
    const code = extractConsumerDhsCode(params.consumerDhsStatus);
    const eligible = INVOICE_ELIGIBLE_STATUSES.has(normalise(params.legalFeesStatus));

    if (code === 'A' || code === 'C') {
        return { action: 'NO_LEGAL_FEES', setStatus: eligible };
    }
    if (code === 'D3' || code === 'D4') {
        return eligible ? { action: 'INVOICE' } : { action: 'SKIP', reason: 'LEGAL_FEES_ALREADY_HANDLED' };
    }
    return { action: 'SKIP', reason: 'DHS_CODE_UNKNOWN' };
}

export function describeLegalFeeSkip(reason: LegalFeeSkipReason, legalFeesStatus?: string | null): string {
    switch (reason) {
        case 'DHS_CODE_UNKNOWN':
            return 'Consumer DHS status is not D3/D4 yet — legal fee invoice not created';
        case 'LEGAL_FEES_ALREADY_HANDLED':
            return `Legal Fees Status is "${legalFeesStatus ?? ''}" — legal fee invoice not created automatically`;
    }
}

/**
 * Legal Fees Status after a payment against the legal fee invoice.
 *
 *   fully paid by debit order        → Debited
 *   fully paid any other way (EFT /
 *   cash deposit / card)             → Fees Paid Cash
 *   part paid                        → Paying
 *
 * "Cash Focus" (a payroll client whose fee was settled from their loan) is never
 * overwritten. Returns null when the status should stay as it is.
 */
export function legalFeesStatusAfterPayment(params: {
    current: string | null | undefined;
    method: string;
    paid: number;
    total: number;
}): string | null {
    const { current, method, paid, total } = params;
    if (normalise(current) === normalise(LEGAL_FEES_STATUS.CASH_FOCUS)) return null;

    let next: string | null = null;
    if (paid >= total && total > 0) {
        next = method === 'DEBIT_ORDER' ? LEGAL_FEES_STATUS.DEBITED : LEGAL_FEES_STATUS.FEES_PAID_CASH;
    } else if (paid > 0) {
        next = LEGAL_FEES_STATUS.PAYING;
    }
    return next && normalise(next) !== normalise(current) ? next : null;
}
