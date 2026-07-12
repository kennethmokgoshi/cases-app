/**
 * Affordability Check — credit report summary + income verification.
 *
 * Business rule (DHS consumer status "A" — active debt review application):
 * if the consumer's total monthly instalments are LESS than the net income on
 * the payslip, confirmed against the salary deposit on the bank statement, the
 * consumer is not over-indebted and the debt review application has to be
 * rejected (consumer should move to status "B"). The rejection pack is:
 * Form 16, Form 17.2(a), Affordability Assessment, and the Record of Consumer
 * Information Furnished.
 *
 * This module is pure — DB/document loading happens in the API routes.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AffordabilityAccountInput {
    status:             string;         // CreditAccount.status — 'ACTIVE' | 'CLOSED' | ...
    outstandingBalance: number;
    monthlyInstalment:  number | null;
    isIncluded:         boolean;
}

export interface OpenCreditAccountInput extends AffordabilityAccountInput {
    id:                 string;
    creditorName:       string;
    providerName:       string | null;
    accountNumber:      string | null;
    accountType:        string;
    accountOpenDate:    Date | string | null;
    lastPaymentDate:    Date | string | null;
    updatedAt:          Date | string;
}

export interface OpenCreditAccountRow {
    id:                 string;
    creditorName:       string;
    providerName:       string | null;
    accountNumber:      string | null;
    accountType:        string;
    openDate:           string | null;
    balance:            number;
    monthlyInstalment:  number | null;
    lastPaymentDate:    string | null;
    lastUpdate:         string;
}

export interface CreditReportSummary {
    openAccounts:            number;
    closedAccounts:          number;
    totalOutstandingBalance: number;   // across open accounts
    totalMonthlyInstalment:  number;   // across open accounts
}

export interface IncomeVerification {
    /** Net income per payslip extraction (falls back to Client.netSalary). */
    payslipNetIncome:           number | null;
    /** Source of the net income figure used. */
    payslipSource:              'PAYSLIP_DOCUMENT' | 'CLIENT_RECORD' | null;
    /** Latest salary deposit found on the bank statement. */
    bankStatementSalaryDeposit: number | null;
    bankStatementSalaryDate:    string | null;
    /** True when the bank statement deposit confirms the payslip net income. */
    bankConfirmed:              boolean;
    /** Absolute difference between payslip net and bank deposit, if both known. */
    varianceAmount:             number | null;
    notes:                      string[];
}

export interface AffordabilityResult {
    summary:              CreditReportSummary;
    income:               IncomeVerification;
    /** totalMonthlyInstalment < net income — null when income is unknown. */
    isAffordable:         boolean | null;
    /** net income − total monthly instalment (null when income unknown). */
    monthlySurplus:       number | null;
    /** Affordable AND bank-statement confirmed → application must be rejected. */
    rejectionRecommended: boolean;
    /** Documents that make up the Status A rejection pack. */
    requiredDocuments:    string[];
}

export const REJECTION_PACK_DOCUMENTS = [
    'FORM_16',
    'FORM_17_2A',
    'AFFORDABILITY_ASSESSMENT',
    'CONSUMER_INFO_RECORD',
] as const;

/**
 * DHS Status C (under debt review, no court order rescinded yet) → Status G
 * (magistrate rescinded the court order). The rescission application pack
 * filed at court, per the C → G removal path.
 */
export const RESCISSION_PACK_DOCUMENTS = [
    'NOTICE_OF_MOTION',
    'FOUNDING_AFFIDAVIT',
    'NOTICE_OF_SET_DOWN',
    'NOTICE_OF_MOTION_RESCISSION',
    'COURT_ORDER_GRANTED',
    'PROOF_OF_SERVICE',
] as const;

/**
 * D4 → F1 (all settled except mortgage): documents the DC generates.
 * Paid-up/prescription letters and the mortgage statement of account are
 * requested from the consumer (via Credo / email), not generated.
 */
export const D4_F1_GENERATED_DOCUMENTS = [
    'CERTIFIED_FORM_19',
    'FORM_17_2C',
    'DEBT_RESTRUCTURING_PROPOSAL',
    'SECTION_71_72_STATEMENT',
] as const;

export const D4_F2_GENERATED_DOCUMENTS = [
    'CERTIFIED_FORM_19',
] as const;

/** Tolerance for matching the payslip net income against the bank deposit. */
export const INCOME_MATCH_TOLERANCE_RAND = 100;
export const INCOME_MATCH_TOLERANCE_PCT  = 0.05;

// ── Credit report summary ─────────────────────────────────────────────────────

function isClosed(status: string): boolean {
    const s = status.trim().toUpperCase();
    return s === 'CLOSED' || s === 'SETTLED' || s === 'PAID_UP' || s === 'WRITTEN_OFF';
}

function toIsoDate(value: Date | string | null): string | null {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function summariseCreditReport(accounts: AffordabilityAccountInput[]): CreditReportSummary {
    let openAccounts = 0;
    let closedAccounts = 0;
    let totalOutstandingBalance = 0;
    let totalMonthlyInstalment = 0;

    for (const acc of accounts) {
        if (isClosed(acc.status)) {
            closedAccounts++;
            continue;
        }
        openAccounts++;
        totalOutstandingBalance += acc.outstandingBalance || 0;
        totalMonthlyInstalment  += acc.monthlyInstalment  || 0;
    }

    return {
        openAccounts,
        closedAccounts,
        totalOutstandingBalance: round2(totalOutstandingBalance),
        totalMonthlyInstalment:  round2(totalMonthlyInstalment),
    };
}

// ── Extraction parsing (Document.extractedData JSON strings) ─────────────────

export function listOpenCreditAccounts(accounts: OpenCreditAccountInput[]): OpenCreditAccountRow[] {
    return accounts
        .filter(account => !isClosed(account.status))
        .map(account => ({
            id: account.id,
            creditorName: account.creditorName,
            providerName: account.providerName,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            openDate: toIsoDate(account.accountOpenDate),
            balance: round2(account.outstandingBalance || 0),
            monthlyInstalment: account.monthlyInstalment == null ? null : round2(account.monthlyInstalment),
            lastPaymentDate: toIsoDate(account.lastPaymentDate),
            lastUpdate: toIsoDate(account.updatedAt) ?? new Date(0).toISOString(),
        }));
}

function parseJson(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function asPositiveNumber(val: unknown): number | null {
    const n = typeof val === 'string' ? Number(val) : val;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}

/** Net salary from a PAYSLIP document's extractedData JSON. */
export function parsePayslipNetIncome(extractedData: string | null | undefined): number | null {
    const data = parseJson(extractedData);
    return data ? asPositiveNumber(data.netSalary) : null;
}

/** Latest salary deposit { amount, date } from a BANK_STATEMENT document's extractedData JSON. */
export function parseBankSalaryDeposit(
    extractedData: string | null | undefined
): { amount: number; date: string | null } | null {
    const data = parseJson(extractedData);
    if (!data) return null;
    const deposit = data.latestSalaryDeposit as Record<string, unknown> | undefined;
    const amount = deposit ? asPositiveNumber(deposit.amount) : null;
    if (amount == null) return null;
    const date = typeof deposit?.date === 'string' && deposit.date !== 'NA' ? deposit.date : null;
    return { amount, date };
}

// ── Income verification ──────────────────────────────────────────────────────

export interface IncomeInputs {
    clientNetSalary:        number | null;
    payslipNetIncome:       number | null;
    bankSalaryDeposit:      number | null;
    bankSalaryDate:         string | null;
}

export function verifyIncome(inputs: IncomeInputs): IncomeVerification {
    const notes: string[] = [];

    const payslipNetIncome = inputs.payslipNetIncome ?? inputs.clientNetSalary;
    const payslipSource: IncomeVerification['payslipSource'] =
        inputs.payslipNetIncome != null ? 'PAYSLIP_DOCUMENT'
        : inputs.clientNetSalary != null ? 'CLIENT_RECORD'
        : null;

    if (payslipSource === 'CLIENT_RECORD') {
        notes.push('No analysed payslip found — using net salary from the client record.');
    }
    if (payslipNetIncome == null) {
        notes.push('Net income unknown — upload and analyse a payslip.');
    }
    if (inputs.bankSalaryDeposit == null) {
        notes.push('No salary deposit found on an analysed bank statement — income is unverified.');
    }

    let bankConfirmed = false;
    let varianceAmount: number | null = null;

    if (payslipNetIncome != null && inputs.bankSalaryDeposit != null) {
        varianceAmount = round2(Math.abs(payslipNetIncome - inputs.bankSalaryDeposit));
        const tolerance = Math.max(INCOME_MATCH_TOLERANCE_RAND, payslipNetIncome * INCOME_MATCH_TOLERANCE_PCT);
        bankConfirmed = varianceAmount <= tolerance;
        if (bankConfirmed) {
            notes.push(`Bank statement salary deposit confirms the payslip net income (variance R${varianceAmount.toFixed(2)}).`);
        } else {
            notes.push(
                `Bank statement salary deposit (R${inputs.bankSalaryDeposit.toFixed(2)}) does not match ` +
                `the payslip net income (R${payslipNetIncome.toFixed(2)}) — verify manually.`
            );
        }
    }

    return {
        payslipNetIncome,
        payslipSource,
        bankStatementSalaryDeposit: inputs.bankSalaryDeposit,
        bankStatementSalaryDate:    inputs.bankSalaryDate,
        bankConfirmed,
        varianceAmount,
        notes,
    };
}

// ── Affordability verdict ────────────────────────────────────────────────────

export function computeAffordability(
    accounts: AffordabilityAccountInput[],
    incomeInputs: IncomeInputs
): AffordabilityResult {
    const summary = summariseCreditReport(accounts);
    const income  = verifyIncome(incomeInputs);

    const net = income.payslipNetIncome;
    const isAffordable   = net == null ? null : summary.totalMonthlyInstalment < net;
    const monthlySurplus = net == null ? null : round2(net - summary.totalMonthlyInstalment);

    // Only recommend rejection when income is bank-statement confirmed —
    // staff approval is still required before any document leaves the system.
    const rejectionRecommended = isAffordable === true && income.bankConfirmed;

    return {
        summary,
        income,
        isAffordable,
        monthlySurplus,
        rejectionRecommended,
        requiredDocuments: rejectionRecommended ? [...REJECTION_PACK_DOCUMENTS] : [],
    };
}

/**
 * Convenience wrapper for API routes: assembles the income inputs from the
 * client record and the analysed PAYSLIP / BANK_STATEMENT documents, then
 * computes affordability. `documents` should be ordered most-recent first.
 */
export interface CaseAffordabilitySource {
    creditAccounts:  AffordabilityAccountInput[];
    clientNetSalary: number | null;
    documents:       { type: string; extractedData: string | null }[];
}

export function computeAffordabilityForCase(source: CaseAffordabilitySource): AffordabilityResult {
    const payslipDoc = source.documents.find(d => d.type === 'PAYSLIP' && d.extractedData);
    const bankDoc    = source.documents.find(d => d.type === 'BANK_STATEMENT' && d.extractedData);

    const bankDeposit = parseBankSalaryDeposit(bankDoc?.extractedData);

    return computeAffordability(source.creditAccounts, {
        clientNetSalary:   source.clientNetSalary,
        payslipNetIncome:  parsePayslipNetIncome(payslipDoc?.extractedData),
        bankSalaryDeposit: bankDeposit?.amount ?? null,
        bankSalaryDate:    bankDeposit?.date ?? null,
    });
}

// ── DHS status helpers ────────────────────────────────────────────────────────

/**
 * True when the stored DHS status represents consumer status code "A"
 * (active debt review application). Accepts raw codes ("A", "a") and
 * labelled values ("A - Application in process"). Never matches "A1".
 */
export function isDhsStatusA(dhsStatus: string | null | undefined): boolean {
    return extractDhsCode(dhsStatus) === 'A';
}

/**
 * True when the stored DHS status represents consumer status code "C"
 * (under debt review — the exit path is a court order rescission to
 * status "G"). Never matches labels that merely start with C words.
 */
export function isDhsStatusC(dhsStatus: string | null | undefined): boolean {
    return extractDhsCode(dhsStatus) === 'C';
}

/** True when the stored DHS status represents consumer status code "D3". */
export function isDhsStatusD3(dhsStatus: string | null | undefined): boolean {
    return extractDhsCode(dhsStatus) === 'D3';
}

/** True when the stored DHS status represents consumer status code "D4". */
export function isDhsStatusD4(dhsStatus: string | null | undefined): boolean {
    return extractDhsCode(dhsStatus) === 'D4';
}

/**
 * Extract the DHS consumer status code from a stored status value.
 * "D4 - Under debt review with court order" → "D4"; unknown/empty → null.
 */
function extractDhsCode(dhsStatus: string | null | undefined): string | null {
    if (!dhsStatus) return null;
    const code = dhsStatus.trim().toUpperCase().split(/[\s\-–:]+/)[0];
    return code || null;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
