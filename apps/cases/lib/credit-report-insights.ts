/**
 * Turns one credit report's AI-extracted data (Document.extractedData, CREDIT_REPORT
 * prompt shape — see packages/shared-lib/src/openai/prompts.ts) into a staff-reviewable
 * list of insights: what's worth disputing, what could be improved, and what's already
 * good. This is a decision-support aid, not a legal or financial verdict — every dispute
 * candidate is phrased as "may be eligible" / "worth reviewing", never "will be removed".
 */

export type InsightCategory = 'dispute' | 'improve' | 'positive' | 'info';

export interface InsightItem {
    category: InsightCategory;
    title: string;
    detail: string;
    relatedCreditor?: string;
}

interface AdverseListingRaw {
    creditor?: string;
    accountNumber?: string;
    adverseCode?: string;
    lastPaymentDate?: string;
    openBalance?: number;
    overdueBalance?: number;
    status?: string;
}

interface AccountRow {
    creditor?: string;
    accountNumber?: string;
    arrearsAmount?: number;
    lastPaymentDate?: string;
}

interface OccurrenceEntry {
    value: string;
    count: number;
}

export interface CreditReportExtractedData {
    creditScore?: { score?: number; band?: string; suppressors?: string[] };
    codixResult?: { outcome?: string; reason?: string };
    debtRestructuring?: {
        ncrdcNo?: string;
        debtCounsellorName?: string;
        debtReviewDate?: string;
        dhsStatus?: string;
    };
    summary?: { totalDebt?: number; totalInstallment?: number; activeAccounts?: number; closedAccounts?: number };
    income?: { grossSalary?: number; netSalary?: number; affordability?: string };
    adverseListings?: AdverseListingRaw[];
    accounts?: AccountRow[];
    enquirySummary?: { totalLast12Months?: number; excessiveFlag?: boolean };
    _occurrences?: { idNumber?: OccurrenceEntry[]; surname?: OccurrenceEntry[]; cellNumber?: OccurrenceEntry[] };
}

const OWN_NCRDC_NO = 'NCRDC3693';
const PRESCRIPTION_YEARS = 3;
const JUDGMENT_PRESCRIPTION_YEARS = 30;
const HIGH_DEBT_TO_INCOME_RATIO = 0.4;

function formatRand(amount: number): string {
    return new Intl.NumberFormat('en-ZA').format(Math.round(amount));
}

function yearsSince(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    const s = dateStr.trim();
    if (!s || s.toUpperCase() === 'NA') return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

function isJudgment(code: string | null | undefined): boolean {
    return (code || '').toUpperCase().includes('JUDG');
}

function normalize(s: string | null | undefined): string {
    return (s ?? '').trim().toUpperCase();
}

export function buildCreditReportInsights(data: CreditReportExtractedData): InsightItem[] {
    const insights: InsightItem[] = [];
    const adverseListings = data.adverseListings || [];
    const accounts = data.accounts || [];

    // ── Prescription candidates (ordinary debt: 3 years; judgment debt: 30 years) ──
    const prescriptionFlaggedListings = new Set<AdverseListingRaw>();
    const listingsForPrescriptionCheck = [
        ...adverseListings.map(a => ({ source: a, creditor: a.creditor, lastPaymentDate: a.lastPaymentDate, judgment: isJudgment(a.adverseCode) })),
        ...accounts.map(a => ({ source: null as AdverseListingRaw | null, creditor: a.creditor, lastPaymentDate: a.lastPaymentDate, judgment: false })),
    ];
    for (const item of listingsForPrescriptionCheck) {
        const years = yearsSince(item.lastPaymentDate);
        if (years === null) continue;
        const threshold = item.judgment ? JUDGMENT_PRESCRIPTION_YEARS : PRESCRIPTION_YEARS;
        if (years >= threshold) {
            if (item.source) prescriptionFlaggedListings.add(item.source);
            insights.push({
                category: 'dispute',
                title: `Possible prescription — ${item.creditor || 'Unknown creditor'}`,
                detail: item.judgment
                    ? `Judgment debt with no recorded payment in ${years.toFixed(1)} years (≥${JUDGMENT_PRESCRIPTION_YEARS}-year judgment prescription period). Judgment debts prescribe on a different timeline than ordinary debt — worth a legal review.`
                    : `No recorded payment in ${years.toFixed(1)} years (≥${PRESCRIPTION_YEARS}-year Prescription Act threshold). May be eligible for a prescription dispute — verify no payment or written acknowledgment has reset the clock before proceeding.`,
                relatedCreditor: item.creditor,
            });
        }
    }

    // ── Every adverse listing should be visible somewhere, even if it isn't (yet) a
    // dispute candidate — otherwise real debt silently disappears from the page. ──
    for (const listing of adverseListings) {
        if (prescriptionFlaggedListings.has(listing)) continue;
        const balance = listing.openBalance ?? listing.overdueBalance ?? 0;
        const years = yearsSince(listing.lastPaymentDate);
        insights.push({
            category: 'info',
            title: `Adverse listing — ${listing.creditor || 'Unknown creditor'}`,
            detail: `${listing.status || listing.adverseCode || 'Adverse listing'}, R${formatRand(Number(balance))}` +
                (years !== null
                    ? `. Last payment ${years.toFixed(1)} years ago — not yet prescription-eligible (under ${PRESCRIPTION_YEARS} years).`
                    : '. Last payment date unknown.'),
            relatedCreditor: listing.creditor,
        });
    }

    // ── Duplicate listings (same creditor + account number appearing more than once) ──
    const allWithAccountNumbers = [...adverseListings, ...accounts];
    const seen = new Map<string, { count: number; creditor: string }>();
    for (const item of allWithAccountNumbers) {
        const num = normalize(item.accountNumber);
        if (!num || num === 'NA') continue;
        const key = `${normalize(item.creditor)}|${num}`;
        const existing = seen.get(key);
        seen.set(key, { count: (existing?.count || 0) + 1, creditor: item.creditor || 'Unknown creditor' });
    }
    for (const { count, creditor } of seen.values()) {
        if (count > 1) {
            insights.push({
                category: 'dispute',
                title: `Duplicate listing — ${creditor}`,
                detail: `This account/account number appears ${count} times across the report. Duplicate listings can unfairly inflate exposure and are disputable with the bureau.`,
                relatedCreditor: creditor,
            });
        }
    }

    // ── Identity data inconsistency (bureau's own occurrence tracking) ──
    const occ = data._occurrences || {};
    const identityFields: [keyof typeof occ, string][] = [
        ['idNumber', 'ID number'],
        ['surname', 'surname'],
        ['cellNumber', 'cell number'],
    ];
    for (const [field, label] of identityFields) {
        const entries = occ[field];
        if (entries && entries.length > 1) {
            insights.push({
                category: 'dispute',
                title: `Inconsistent ${label} on record`,
                detail: `The bureau report shows ${entries.length} different values for ${label}: ${entries.map(e => `"${e.value}" (${e.count}×)`).join(', ')}. Worth disputing with the bureau to correct the consumer record.`,
            });
        }
    }

    // ── Excessive enquiries ──
    if (data.enquirySummary?.excessiveFlag) {
        insights.push({
            category: 'dispute',
            title: 'Excessive credit enquiries',
            detail: `${data.enquirySummary.totalLast12Months ?? 0} enquiries recorded in the last 12 months, exceeding the normal threshold (more than 4 in any 3-month window). Confirm each was actually authorized — unauthorized enquiries can be disputed.`,
        });
    }

    // ── Score suppressors → improve ──
    for (const s of data.creditScore?.suppressors || []) {
        if (!s) continue;
        insights.push({
            category: 'improve',
            title: 'Credit score suppressor',
            detail: `"${s}" is listed as a factor lowering the score. Resolving the underlying account status may help improve it.`,
        });
    }

    // ── Accounts in arrears but not yet adverse → improve ──
    for (const a of accounts) {
        const arrears = Number(a.arrearsAmount) || 0;
        if (arrears > 0) {
            insights.push({
                category: 'improve',
                title: `Account in arrears — ${a.creditor || 'Unknown creditor'}`,
                detail: `R${formatRand(arrears)} in arrears. Bringing this current avoids it becoming a new adverse listing.`,
                relatedCreditor: a.creditor,
            });
        }
    }

    // ── High debt-to-income ratio → improve (points to the full Affordability Check, doesn't replace it) ──
    const netSalary = Number(data.income?.netSalary) || 0;
    const totalInstallment = Number(data.summary?.totalInstallment) || 0;
    if (netSalary > 0 && totalInstallment > 0) {
        const ratio = totalInstallment / netSalary;
        if (ratio >= HIGH_DEBT_TO_INCOME_RATIO) {
            insights.push({
                category: 'improve',
                title: 'High debt-to-income ratio',
                detail: `This report's declared net income (R${formatRand(netSalary)}) vs. total instalments (R${formatRand(totalInstallment)}) is a ${(ratio * 100).toFixed(0)}% ratio. Run the full Affordability Check (payslip + bank statement, bank-confirmed) for an authoritative verdict before acting on this figure alone.`,
            });
        }
    }

    // ── Positive signals ──
    if (adverseListings.length === 0) {
        insights.push({
            category: 'positive',
            title: 'No adverse listings',
            detail: 'No handed-over, written-off, judgment, or default accounts recorded on this report.',
        });
    }
    const band = data.creditScore?.band;
    if (band === 'Good' || band === 'Great') {
        insights.push({
            category: 'positive',
            title: `${band} credit score`,
            detail: `Score of ${data.creditScore?.score ?? 'N/A'} falls in the "${band}" band.`,
        });
    }
    if (data.enquirySummary && !data.enquirySummary.excessiveFlag) {
        insights.push({
            category: 'positive',
            title: 'Enquiry activity within normal range',
            detail: `${data.enquirySummary.totalLast12Months ?? 0} enquiries in the last 12 months — no excessive-enquiry flag.`,
        });
    }
    const hasIdentityIssue = identityFields.some(([field]) => (occ[field]?.length || 0) > 1);
    if (!hasIdentityIssue && (occ.idNumber?.length || 0) === 1) {
        insights.push({
            category: 'positive',
            title: 'Consistent identity data',
            detail: 'ID number, surname, and cell number are consistent across the report — no conflicting entries found.',
        });
    }

    // ── Informational context ──
    const ncrdcNo = normalize(data.debtRestructuring?.ncrdcNo);
    if (ncrdcNo && ncrdcNo !== 'NA') {
        if (ncrdcNo !== OWN_NCRDC_NO) {
            insights.push({
                category: 'info',
                title: 'Registered under a different debt counsellor',
                detail: `This report shows an active debt review registration under ${data.debtRestructuring?.ncrdcNo}${data.debtRestructuring?.debtCounsellorName ? ` (${data.debtRestructuring.debtCounsellorName})` : ''} — not Zenowethu (${OWN_NCRDC_NO}). Verify with the consumer/DHS whether this needs to be transferred or updated before proceeding.`,
            });
        } else {
            insights.push({
                category: 'info',
                title: 'Debt review registered with Zenowethu',
                detail: `Registered under ${OWN_NCRDC_NO}${data.debtRestructuring?.debtReviewDate ? ` since ${data.debtRestructuring.debtReviewDate}` : ''}. Status: ${data.debtRestructuring?.dhsStatus || 'unspecified'}.`,
            });
        }
    }
    if (data.codixResult?.outcome && normalize(data.codixResult.outcome) !== 'NA') {
        insights.push({
            category: 'info',
            title: `Automated bureau decision: ${data.codixResult.outcome}`,
            detail: data.codixResult.reason && normalize(data.codixResult.reason) !== 'NA'
                ? data.codixResult.reason
                : 'No reason provided by the bureau.',
        });
    }

    return insights;
}
