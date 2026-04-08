import { getOpenAI } from './client';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdverseClassification = 'DISPUTABLE' | 'NEGOTIABLE' | 'VALID';
export type ArrearsSeverity = 'CRITICAL' | 'WARNING' | 'MONITOR';
export type CreditBand = 'Poor' | 'Below Average' | 'Average' | 'Good' | 'Great' | 'Unknown';
export type ActionPriority = '[CRITICAL]' | '[HIGH]' | '[MEDIUM]' | '[LOW]';

export interface ClassifiedAdverseListing {
    creditor: string;
    accountNumber: string;
    adverseCode: string;
    adverseDate: string;
    lastPaymentDate: string;
    openBalance: number;
    overdueBalance: number;
    monthsInArrears: number;
    paymentHistory: string;
    status: string;
    classification: AdverseClassification;
    grounds: string[];
    isPrescribed: boolean;
}

export interface ClassifiedArrearsAccount {
    creditor: string;
    accountNumber: string;
    balance: number;
    arrearsAmount: number;
    monthsInArrears: number;
    installment: number;
    severity: ArrearsSeverity;
    note: string;
}

export interface PerformingAccount {
    creditor: string;
    accountNumber: string;
    balance: number;
    installment: number;
    status: string;
}

export interface EnquiryAnalysis {
    enquiries: Array<{ date: string; enquirer: string; type: string; reason: string }>;
    last12Months: number;
    isExcessivePattern: boolean;
    flagMessage: string | null;
}

export interface MonthlyExposureBreakdown {
    total: number;
    creditCards: number;
    retailAccounts: number;
    microLoans: number;
    termLoans: number;
    homeLoans: number;
    vehicleFinance: number;
    other: number;
}

export interface ActionItem {
    action: string;
    priority: ActionPriority;
    reason: string;
    timeline?: string;
}

export interface PriorityActionPlan {
    immediate: ActionItem[];   // Week 1–2
    shortTerm: ActionItem[];   // Month 1–3
    mediumTerm: ActionItem[];  // Month 3–12
    longTerm: ActionItem[];    // Month 12–24
    documentsRequired: string[];
}

export interface FullCreditAnalysis {
    creditScore: {
        score: number;
        band: CreditBand;
        suppressors: string[];
        improvementTimeline: string;
    };
    adverseListings: ClassifiedAdverseListing[];
    arrearsAccounts: ClassifiedArrearsAccount[];
    performingAccounts: PerformingAccount[];
    enquiryAnalysis: EnquiryAnalysis;
    paymentBehaviourNarrative: string;
    monthlyExposure: MonthlyExposureBreakdown;
    priorityActionPlan: PriorityActionPlan;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a date string (YYYY-MM-DD) into a Date. Returns null if invalid/NA. */
function parseDate(dateStr: string): Date | null {
    if (!dateStr || dateStr === 'NA' || dateStr === '0') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/** Number of years between a date and today */
function yearsAgo(date: Date): number {
    const now = new Date();
    return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

/** Check if a debt is prescribed (>3 years since last payment with no acknowledgment) */
function isPrescribed(lastPaymentDate: string, adverseDate: string): boolean {
    const lastPayment = parseDate(lastPaymentDate);
    const adverse = parseDate(adverseDate);
    // Use whichever date is more recent as the starting point
    const referenceDate = lastPayment && adverse
        ? (lastPayment > adverse ? lastPayment : adverse)
        : (lastPayment || adverse);
    if (!referenceDate) return false;
    return yearsAgo(referenceDate) > 3;
}

/** Determine if an adverse code is a "hard" adverse */
function isHardAdverse(adverseCode: string): boolean {
    const code = adverseCode.toLowerCase();
    return (
        code.includes('judgment') ||
        code.includes('administration') ||
        code.includes('written off') ||
        code.includes('bad debt')
    );
}

/** Categorise a creditor name into a credit type for exposure breakdown */
function categorizeCreditType(creditor: string): keyof Omit<MonthlyExposureBreakdown, 'total'> {
    const c = creditor.toLowerCase();
    if (c.includes('home') || c.includes('bond') || c.includes('sa home loans') || c.includes('nedbank home')) return 'homeLoans';
    if (c.includes('vehicle') || c.includes('motor') || c.includes('wesbank') || c.includes('std bank vaf') || c.includes('absa vaf')) return 'vehicleFinance';
    if (c.includes('credit card') || c.includes('visa') || c.includes('mastercard') || c.includes('amex')) return 'creditCards';
    if (c.includes('lewis') || c.includes('jet') || c.includes('truworths') || c.includes('edgars') || c.includes('mr price') || c.includes('account')) return 'retailAccounts';
    if (c.includes('finchoice') || c.includes('capfin') || c.includes('bayport') || c.includes('african bank') || c.includes('wonga') || c.includes('lime') || c.includes('izwe') || c.includes('boodle')) return 'microLoans';
    if (c.includes('fnb') || c.includes('absa') || c.includes('standard bank') || c.includes('nedbank') || c.includes('capitec') || c.includes('discovery') || c.includes('investec')) return 'termLoans';
    return 'other';
}

// ---------------------------------------------------------------------------
// Step 1: Classify adverse listings
// ---------------------------------------------------------------------------

export function classifyAdverseListings(
    adverseListings: any[],
    debtReviewDate?: string
): ClassifiedAdverseListing[] {
    if (!Array.isArray(adverseListings)) return [];

    return adverseListings.map((listing) => {
        const grounds: string[] = [];
        const prescribed = isPrescribed(listing.lastPaymentDate, listing.adverseDate);
        const debtReviewDateParsed = parseDate(debtReviewDate || 'NA');
        const adverseDateParsed = parseDate(listing.adverseDate);

        if (prescribed) {
            grounds.push('Debt has prescribed under the Prescription Act 68 of 1969 (3-year rule — no payment or acknowledgment of debt)');
        }

        if (debtReviewDateParsed && adverseDateParsed && debtReviewDateParsed <= adverseDateParsed) {
            grounds.push('Consumer was under debt review at the time this adverse listing was placed — listing may be in contravention of the NCA');
        }

        const payHist = String(listing.paymentHistory || '');
        if (payHist.includes('?????') || payHist.includes('?')) {
            grounds.push('Payment history contains data gaps ("?????" entries) indicating missing or unknown payment data — NCA Section 72(1)(b)');
        }

        const status = String(listing.status || '').toLowerCase();
        if (status.includes('paid') || status.includes('settled') || status.includes('closed')) {
            grounds.push('Account appears paid up or settled yet adverse listing remains — NCA Section 71 removal right applies');
        }

        const adverseAge = adverseDateParsed ? yearsAgo(adverseDateParsed) : 0;
        if (adverseAge > 5) {
            grounds.push('Adverse listing is older than 5 years — stale information should be removed under Credit Bureau Regulations');
        }

        if (!isHardAdverse(listing.adverseCode) && grounds.length === 0) {
            // Handed Over accounts: Section 129 non-compliance is a common ground
            const code = String(listing.adverseCode || '').toLowerCase();
            if (code.includes('handed over')) {
                grounds.push('Section 129 notice was never received by consumer prior to adverse action — procedural non-compliance under the NCA');
            }
        }

        let classification: AdverseClassification;
        if (grounds.length > 0) {
            classification = 'DISPUTABLE';
        } else if (listing.openBalance > 0 && !isHardAdverse(listing.adverseCode)) {
            classification = 'NEGOTIABLE';
        } else {
            classification = 'VALID';
        }

        return {
            creditor: listing.creditor || 'Unknown',
            accountNumber: listing.accountNumber || 'NA',
            adverseCode: listing.adverseCode || 'NA',
            adverseDate: listing.adverseDate || 'NA',
            lastPaymentDate: listing.lastPaymentDate || 'NA',
            openBalance: listing.openBalance || 0,
            overdueBalance: listing.overdueBalance || 0,
            monthsInArrears: listing.monthsInArrears || 0,
            paymentHistory: listing.paymentHistory || 'NA',
            status: listing.status || 'NA',
            classification,
            grounds,
            isPrescribed: prescribed,
        };
    });
}

// ---------------------------------------------------------------------------
// Step 2: Classify open accounts in arrears
// ---------------------------------------------------------------------------

export function classifyArrearsAccounts(accounts: any[]): ClassifiedArrearsAccount[] {
    if (!Array.isArray(accounts)) return [];

    return accounts
        .filter((a) => (a.arrearsAmount || 0) > 0)
        .map((a) => {
            const months = a.monthsInArrears || Math.round((a.arrearsAmount || 0) / Math.max(a.installment || 1, 1));
            let severity: ArrearsSeverity;
            let note: string;

            if (months >= 3) {
                severity = 'CRITICAL';
                note = `${months}+ months in arrears — approaching adverse listing status. Immediate payment arrangement required.`;
            } else if (months >= 1) {
                severity = 'WARNING';
                note = `${months} month(s) in arrears — deteriorating. Catch-up payment needed urgently.`;
            } else {
                severity = 'MONITOR';
                note = 'Minor arrears — monitor closely and prevent further deterioration.';
            }

            return {
                creditor: a.creditor || 'Unknown',
                accountNumber: a.accountNumber || 'NA',
                balance: a.balance || 0,
                arrearsAmount: a.arrearsAmount || 0,
                monthsInArrears: months,
                installment: a.installment || 0,
                severity,
                note,
            };
        })
        .sort((a, b) => {
            const order: Record<ArrearsSeverity, number> = { CRITICAL: 0, WARNING: 1, MONITOR: 2 };
            return order[a.severity] - order[b.severity];
        });
}

// ---------------------------------------------------------------------------
// Step 3: Identify performing accounts
// ---------------------------------------------------------------------------

export function identifyPerformingAccounts(accounts: any[]): PerformingAccount[] {
    if (!Array.isArray(accounts)) return [];

    return accounts
        .filter((a) => {
            const arrears = a.arrearsAmount || 0;
            const hist = String(a.paymentHistory || '');
            const hasArrears = arrears > 0;
            // Payment history with only C (Current) or 0 (paid) entries is clean
            const isClean = hist.length > 0 && hist !== 'NA' && !/[1-9]/.test(hist.replace(/[C0\-\s]/g, ''));
            const status = String(a.status || '').toLowerCase();
            const isClosedOrAdverse = status.includes('written') || status.includes('handed') || status.includes('judgment');
            return !hasArrears && !isClosedOrAdverse && (isClean || hist === 'NA');
        })
        .map((a) => ({
            creditor: a.creditor || 'Unknown',
            accountNumber: a.accountNumber || 'NA',
            balance: a.balance || 0,
            installment: a.installment || 0,
            status: a.status || 'NA',
        }));
}

// ---------------------------------------------------------------------------
// Step 4: Enquiry analysis
// ---------------------------------------------------------------------------

export function analyzeEnquiries(enquiries: any[], enquirySummary?: any): EnquiryAnalysis {
    const list = Array.isArray(enquiries) ? enquiries : [];
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const recent = list.filter((e) => {
        const d = parseDate(e.date);
        return d && d >= twelveMonthsAgo;
    });

    // Check any 3-month rolling window for >4 enquiries
    let isExcessive = enquirySummary?.excessiveFlag === true;
    if (!isExcessive && recent.length > 4) {
        // Check each enquiry as a 3-month window start
        for (const base of recent) {
            const baseDate = parseDate(base.date);
            if (!baseDate) continue;
            const windowEnd = new Date(baseDate);
            windowEnd.setMonth(windowEnd.getMonth() + 3);
            const inWindow = recent.filter((e) => {
                const d = parseDate(e.date);
                return d && d >= baseDate && d <= windowEnd;
            });
            if (inWindow.length > 4) {
                isExcessive = true;
                break;
            }
        }
    }

    return {
        enquiries: list,
        last12Months: enquirySummary?.totalLast12Months ?? recent.length,
        isExcessivePattern: isExcessive,
        flagMessage: isExcessive
            ? `Excessive enquiry pattern detected: more than 4 credit applications in a 3-month window. This significantly suppresses the credit score and signals high credit-seeking behaviour to lenders.`
            : null,
    };
}

// ---------------------------------------------------------------------------
// Step 5: Monthly exposure breakdown
// ---------------------------------------------------------------------------

export function calculateMonthlyExposure(accounts: any[], adverseListings: any[]): MonthlyExposureBreakdown {
    const breakdown: MonthlyExposureBreakdown = {
        total: 0,
        creditCards: 0,
        retailAccounts: 0,
        microLoans: 0,
        termLoans: 0,
        homeLoans: 0,
        vehicleFinance: 0,
        other: 0,
    };

    const allAccounts = [...(Array.isArray(accounts) ? accounts : []), ...(Array.isArray(adverseListings) ? adverseListings : [])];
    for (const a of allAccounts) {
        const installment = a.installment || 0;
        if (installment <= 0) continue;
        const category = categorizeCreditType(a.creditor || '');
        breakdown[category] += installment;
        breakdown.total += installment;
    }

    // Round all values
    for (const key of Object.keys(breakdown) as Array<keyof MonthlyExposureBreakdown>) {
        breakdown[key] = Math.round(breakdown[key] * 100) / 100;
    }

    return breakdown;
}

// ---------------------------------------------------------------------------
// Step 6: Payment behaviour narrative (GPT-4o)
// ---------------------------------------------------------------------------

async function generatePaymentNarrative(rawCreditReport: any): Promise<string> {
    try {
        const accountSummary = JSON.stringify({
            accounts: rawCreditReport.accounts?.slice(0, 15),
            adverseListings: rawCreditReport.adverseListings?.slice(0, 10),
            creditScore: rawCreditReport.creditScore,
            summary: rawCreditReport.summary,
        });

        const openai = getOpenAI();
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: `You are a South African credit repair expert. Analyze this credit report data and write a concise 2–4 sentence payment behaviour narrative. Focus on: payment patterns (micro-loan cycling, refinancing, deteriorating history), cash flow collapse indicators, and the overall credit health trajectory. Do NOT mention specific account numbers. Be professional and factual.\n\nDATA:\n${accountSummary}`,
            }],
            max_tokens: 300,
            temperature: 0.3,
        });

        return response.choices[0]?.message?.content?.trim() || 'Payment behaviour analysis unavailable.';
    } catch (err) {
        logger.error({ err }, 'Failed to generate payment narrative');
        return 'Payment behaviour analysis unavailable.';
    }
}

// ---------------------------------------------------------------------------
// Step 7: Priority Action Plan (GPT-4o)
// ---------------------------------------------------------------------------

async function generateActionPlan(
    rawReport: any,
    classifiedAdverse: ClassifiedAdverseListing[],
    arrearsAccounts: ClassifiedArrearsAccount[],
    enquiryAnalysis: EnquiryAnalysis
): Promise<PriorityActionPlan> {
    const disputable = classifiedAdverse.filter((a) => a.classification === 'DISPUTABLE');
    const negotiable = classifiedAdverse.filter((a) => a.classification === 'NEGOTIABLE');
    const critical = arrearsAccounts.filter((a) => a.severity === 'CRITICAL');

    const context = {
        creditScore: rawReport.creditScore,
        disputableCount: disputable.length,
        negotiableCount: negotiable.length,
        criticalArrearsCount: critical.length,
        prescribedDebts: classifiedAdverse.filter((a) => a.isPrescribed).map((a) => a.creditor),
        excessiveEnquiries: enquiryAnalysis.isExcessivePattern,
        topDisputableGrounds: disputable.slice(0, 3).map((a) => ({ creditor: a.creditor, grounds: a.grounds[0] })),
        topCriticalArrears: critical.slice(0, 3).map((a) => ({ creditor: a.creditor, arrears: a.arrearsAmount })),
    };

    try {
        const openai = getOpenAI();
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: `You are a South African credit repair consultant for Zenowethu Debt Management (NCRDC3693). Generate a structured priority action plan based on this credit analysis summary. Return ONLY valid JSON with no markdown.

CREDIT ANALYSIS CONTEXT:
${JSON.stringify(context, null, 2)}

Return this exact JSON structure:
{
  "immediate": [
    { "action": "string", "priority": "[CRITICAL]|[HIGH]|[MEDIUM]|[LOW]", "reason": "string" }
  ],
  "shortTerm": [
    { "action": "string", "priority": "[CRITICAL]|[HIGH]|[MEDIUM]|[LOW]", "reason": "string", "timeline": "string" }
  ],
  "mediumTerm": [
    { "action": "string", "priority": "[CRITICAL]|[HIGH]|[MEDIUM]|[LOW]", "reason": "string", "timeline": "string" }
  ],
  "longTerm": [
    { "action": "string", "priority": "[CRITICAL]|[HIGH]|[MEDIUM]|[LOW]", "reason": "string", "timeline": "string" }
  ],
  "documentsRequired": ["string"]
}

Rules:
- immediate: 1–3 highest-impact, lowest-effort actions (Week 1–2)
- shortTerm: dispute filings, settlements, payment arrangements (Month 1–3)
- mediumTerm: profile rebuilding, account management (Month 3–12)
- longTerm: score recovery milestones (Month 12–24)
- documentsRequired: list all documents needed to proceed (ID, POA, credit report, paid-up letters, etc.)
- Be specific to the South African NCA framework
- End every plan with: "This is credit repair assistance, not legal advice."`,
            }],
            max_tokens: 1200,
            temperature: 0.2,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        return {
            immediate: parsed.immediate || [],
            shortTerm: parsed.shortTerm || [],
            mediumTerm: parsed.mediumTerm || [],
            longTerm: parsed.longTerm || [],
            documentsRequired: parsed.documentsRequired || ['Valid South African ID', 'Signed Power of Attorney', 'Recent credit bureau report (within 30 days)'],
        };
    } catch (err) {
        logger.error({ err }, 'Failed to generate action plan');
        return {
            immediate: [{ action: 'Obtain and review full credit bureau report', priority: '[HIGH]', reason: 'Cannot proceed without current bureau data' }],
            shortTerm: [],
            mediumTerm: [],
            longTerm: [],
            documentsRequired: ['Valid South African ID', 'Signed Power of Attorney', 'Recent credit bureau report (within 30 days)'],
        };
    }
}

// ---------------------------------------------------------------------------
// Credit score improvement timeline
// ---------------------------------------------------------------------------

function getImprovementTimeline(band: CreditBand, disputableCount: number, arrearsCount: number): string {
    if (band === 'Great' || band === 'Good') {
        return 'Score is already strong. Maintain current payment behaviour and avoid new credit applications.';
    }
    if (disputableCount > 0 && arrearsCount === 0) {
        return 'With successful dispute removals, score improvement of 50–120 points is possible within 3–6 months.';
    }
    if (arrearsCount > 3) {
        return 'Significant arrears present. Score recovery expected over 12–24 months with consistent payments and dispute resolution.';
    }
    if (band === 'Poor') {
        return 'Profile is severely damaged. Realistic improvement of 30–60 points per 6-month period with dispute resolution and payment consistency.';
    }
    return 'With dispute resolution and payment arrangements in place, meaningful score improvement expected within 6–12 months.';
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the full credit analysis pipeline on extracted credit report data.
 * Pass the raw extractedData from a CREDIT_REPORT document.
 */
export async function runFullCreditAnalysis(rawCreditReport: any): Promise<FullCreditAnalysis> {
    logger.info('🔍 Running full credit analysis...');

    const debtReviewDate = rawCreditReport.debtRestructuring?.debtReviewDate;

    // 1. Classify adverse listings
    const adverseListings = classifyAdverseListings(
        rawCreditReport.adverseListings || [],
        debtReviewDate
    );

    // 2. Classify open accounts in arrears
    const arrearsAccounts = classifyArrearsAccounts(rawCreditReport.accounts || []);

    // 3. Identify performing accounts
    const performingAccounts = identifyPerformingAccounts(rawCreditReport.accounts || []);

    // 4. Enquiry analysis
    const enquiryAnalysis = analyzeEnquiries(
        rawCreditReport.enquiries || [],
        rawCreditReport.enquirySummary
    );

    // 5. Monthly exposure
    const monthlyExposure = calculateMonthlyExposure(
        rawCreditReport.accounts || [],
        rawCreditReport.adverseListings || []
    );

    // 6. Credit score
    const rawScore = rawCreditReport.creditScore || {};
    const band: CreditBand = rawScore.band || 'Unknown';
    const creditScore = {
        score: rawScore.score || 0,
        band,
        suppressors: Array.isArray(rawScore.suppressors) ? rawScore.suppressors : [],
        improvementTimeline: getImprovementTimeline(band, adverseListings.filter((a) => a.classification === 'DISPUTABLE').length, arrearsAccounts.length),
    };

    // 7 & 8. Narrative + action plan (parallel GPT-4o calls)
    const [paymentBehaviourNarrative, priorityActionPlan] = await Promise.all([
        generatePaymentNarrative(rawCreditReport),
        generateActionPlan(rawCreditReport, adverseListings, arrearsAccounts, enquiryAnalysis),
    ]);

    logger.info('✅ Full credit analysis complete');

    return {
        creditScore,
        adverseListings,
        arrearsAccounts,
        performingAccounts,
        enquiryAnalysis,
        paymentBehaviourNarrative,
        monthlyExposure,
        priorityActionPlan,
    };
}
