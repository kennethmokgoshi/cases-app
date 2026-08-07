export const CREDIT_REPORT_DOC_TYPES = new Set([
    'CREDIT_REPORT',
    'CREDIT_BUREAU_REPORT',
    'CREDIT_REPORT_OTHER',
    'CREDIT_REPORT_EXPERIAN',
    'CREDIT_REPORT_TRANSUNION',
    'CREDIT_REPORT_XDS',
    'CREDIT_REPORT_LIGHTSTONE',
    'EXPERIAN',
    'TRANSUNION',
    'XDS',
    'CLEAR_SCORE',
    'KUDOUGH',
]);

const MORTGAGE_HINTS = ['mortgage', 'bond', 'home loan'];
const VEHICLE_HINTS = ['vehicle', 'motor', 'vaf', 'wesbank', 'auto'];
const CARD_HINTS = ['credit card', 'card'];
const RETAIL_HINTS = ['edgars', 'truworths', 'foschini', 'jet', 'ackermans', 'mr price', 'woolworths', 'retail', 'store', 'lewis', 'jd group'];
const PERSONAL_LOAN_HINTS = ['personal loan', 'loan'];

/** Best-effort guess at account type from creditor name — always staff-editable before commit. */
export function inferAccountType(creditorName: string): string {
    const name = (creditorName || '').toLowerCase();
    if (MORTGAGE_HINTS.some(h => name.includes(h))) return 'Mortgage';
    if (VEHICLE_HINTS.some(h => name.includes(h))) return 'Vehicle Finance';
    if (CARD_HINTS.some(h => name.includes(h))) return 'Credit Card';
    if (RETAIL_HINTS.some(h => name.includes(h))) return 'Retail';
    if (PERSONAL_LOAN_HINTS.some(h => name.includes(h))) return 'Personal Loan';
    return 'Other';
}

/** AI-extracted dates arrive as 'YYYY-MM-DD' or the literal string 'NA'. */
export function parseAiDate(val: string | null | undefined): Date | null {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed.toUpperCase() === 'NA') return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
}

function normalize(s: string | null | undefined): string {
    return (s ?? '').trim().toUpperCase();
}

/** Two accounts are the same account if account numbers match, else fall back to creditor name. */
export function accountsMatch(
    a: { creditorName: string; accountNumber: string | null },
    b: { creditorName: string; accountNumber: string | null }
): boolean {
    const aNum = normalize(a.accountNumber);
    const bNum = normalize(b.accountNumber);
    if (aNum && bNum && aNum !== 'UNKNOWN' && aNum !== 'NA') {
        return aNum === bNum;
    }
    return normalize(a.creditorName) === normalize(b.creditorName);
}

export interface ExtractedAccountRaw {
    creditor?: string;
    accountNumber?: string;
    originalAmount?: number;
    balance?: number;
    installment?: number;
    insurancePremium?: number;
    contractStart?: string;
    contractTerm?: number;
    remainingMonths?: number;
    arrearsAmount?: number;
    status?: string;
    paymentHistory?: string;
    lastPaymentDate?: string;
}

export interface CreditAccountCandidate {
    sourceDocumentId: string;
    sourceDocumentType: string;
    creditorName: string;
    accountNumber: string | null;
    accountType: string;
    originalAmount: number | null;
    outstandingBalance: number;
    monthlyInstalment: number | null;
    termMonths: number | null;
    accountOpenDate: string | null;
    lastPaymentDate: string | null;
    status: string;
    hasInsurance: boolean;
    premiumAmount: number | null;
    matchStatus: 'NEW' | 'DUPLICATE';
    existingAccountId: string | null;
}

/** Maps one AI-extracted credit report account row onto a staff-reviewable CreditAccount candidate. */
export function mapExtractedAccountToCandidate(
    raw: ExtractedAccountRaw,
    source: { id: string; type: string },
    existingAccounts: { id: string; creditorName: string; accountNumber: string | null }[]
): CreditAccountCandidate {
    const creditorName = (raw.creditor || 'Unknown Creditor').trim() || 'Unknown Creditor';
    const rawAccountNumber = (raw.accountNumber || '').trim();
    const accountNumber = rawAccountNumber && rawAccountNumber.toUpperCase() !== 'NA' ? rawAccountNumber : null;
    const lastPaymentDate = parseAiDate(raw.lastPaymentDate);
    const accountOpenDate = parseAiDate(raw.contractStart);

    const existing = existingAccounts.find(e => accountsMatch({ creditorName, accountNumber }, e));

    return {
        sourceDocumentId: source.id,
        sourceDocumentType: source.type,
        creditorName,
        accountNumber,
        accountType: inferAccountType(creditorName),
        originalAmount: raw.originalAmount != null && Number(raw.originalAmount) > 0 ? Number(raw.originalAmount) : null,
        outstandingBalance: Number(raw.balance) || 0,
        monthlyInstalment: raw.installment != null && !isNaN(Number(raw.installment)) ? Number(raw.installment) : null,
        termMonths: raw.contractTerm != null && !isNaN(Number(raw.contractTerm)) ? Number(raw.contractTerm) : null,
        accountOpenDate: accountOpenDate ? accountOpenDate.toISOString() : null,
        lastPaymentDate: lastPaymentDate ? lastPaymentDate.toISOString() : null,
        status: (raw.status || '').trim() || 'ACTIVE',
        hasInsurance: Boolean(raw.insurancePremium && Number(raw.insurancePremium) > 0),
        premiumAmount: raw.insurancePremium != null && Number(raw.insurancePremium) > 0 ? Number(raw.insurancePremium) : null,
        matchStatus: existing ? 'DUPLICATE' : 'NEW',
        existingAccountId: existing ? existing.id : null,
    };
}

/**
 * Written-off / handed-over / judgment accounts live in a separate `adverseListings[]`
 * array in the AI extraction, not `accounts[]` — a credit report can have real, currently
 * owed debt with an empty `accounts` array and everything sitting here instead.
 */
export interface ExtractedAdverseListingRaw {
    creditor?: string;
    accountNumber?: string;
    adverseCode?: string;
    adverseDate?: string;
    lastPaymentDate?: string;
    openBalance?: number;
    overdueBalance?: number;
    monthsInArrears?: number;
    paymentHistory?: string;
    status?: string;
}

/** Maps one AI-extracted adverse listing row onto a staff-reviewable CreditAccount candidate. */
export function mapExtractedAdverseListingToCandidate(
    raw: ExtractedAdverseListingRaw,
    source: { id: string; type: string },
    existingAccounts: { id: string; creditorName: string; accountNumber: string | null }[]
): CreditAccountCandidate {
    const creditorName = (raw.creditor || 'Unknown Creditor').trim() || 'Unknown Creditor';
    const rawAccountNumber = (raw.accountNumber || '').trim();
    const accountNumber = rawAccountNumber && rawAccountNumber.toUpperCase() !== 'NA' ? rawAccountNumber : null;
    const lastPaymentDate = parseAiDate(raw.lastPaymentDate);

    const existing = existingAccounts.find(e => accountsMatch({ creditorName, accountNumber }, e));
    const status = (raw.status || raw.adverseCode || '').trim() || 'ADVERSE LISTING';
    const balance = raw.openBalance ?? raw.overdueBalance;

    return {
        sourceDocumentId: source.id,
        sourceDocumentType: source.type,
        creditorName,
        accountNumber,
        accountType: inferAccountType(creditorName),
        originalAmount: null,
        outstandingBalance: Number(balance) || 0,
        monthlyInstalment: null,
        termMonths: null,
        accountOpenDate: null,
        lastPaymentDate: lastPaymentDate ? lastPaymentDate.toISOString() : null,
        status,
        hasInsurance: false,
        premiumAmount: null,
        matchStatus: existing ? 'DUPLICATE' : 'NEW',
        existingAccountId: existing ? existing.id : null,
    };
}
