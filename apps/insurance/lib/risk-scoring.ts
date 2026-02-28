/**
 * Risk Scoring Engine for Credit Life Insurance Underwriting
 *
 * Calculates a composite risk score (0–100) for a client, where higher = more risk.
 * Outputs a risk tier (LOW / MEDIUM / HIGH / VERY_HIGH) used by the underwriting engine.
 *
 * Factors scored:
 *  1. Age (derived from SA ID number)
 *  2. Employment status
 *  3. Debt-to-income ratio (total monthly instalment vs net salary)
 *  4. Affordability surplus
 *  5. Number of active credit accounts
 *  6. Total outstanding balance exposure
 */

export type EmploymentStatus = 'Employed' | 'Self-Employed' | 'Unemployed' | 'Pensioner' | 'Unknown';
export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface RiskFactorResult {
    factor: string;
    score: number;       // 0–25 per factor (raw contribution)
    maxScore: number;
    detail: string;
    flag?: string;       // NCA/regulatory flag if applicable
}

export interface RiskScoreInput {
    /** South African 13-digit ID number */
    idNumber: string;
    employmentStatus: EmploymentStatus;
    /** Monthly net (take-home) salary in ZAR */
    netSalary: number;
    /** Monthly gross salary in ZAR */
    grossSalary?: number;
    /** Total outstanding balance across all credit accounts in ZAR */
    totalOutstandingBalance: number;
    /** Total monthly instalment across all credit accounts in ZAR */
    totalMonthlyInstalment: number;
    /** Number of active (non-prescribed, non-closed) credit accounts */
    activeAccountCount: number;
    /** Whether the client is already in debt review */
    isInDebtReview?: boolean;
}

export interface RiskScoreResult {
    /** Composite score 0 (no risk) to 100 (highest risk) */
    totalScore: number;
    /** Risk tier derived from totalScore */
    tier: RiskTier;
    /** Age derived from SA ID number (-1 if ID is invalid) */
    derivedAge: number;
    /** Breakdown of each factor */
    factors: RiskFactorResult[];
    /** Summary flags for underwriting attention */
    flags: string[];
    /** Human-readable summary */
    summary: string;
    /** ISO timestamp when the score was computed */
    scoredAt: string;
}

// ─── Utility: Extract age from SA ID ────────────────────────────────────────

/**
 * Extracts the date of birth from a South African 13-digit ID number.
 * SA ID format: YYMMDD SSSS C A Z
 */
export function extractAgeFromSAId(idNumber: string): number {
    const cleaned = idNumber.replace(/\s/g, '');
    if (!/^\d{13}$/.test(cleaned)) return -1;

    const yy = parseInt(cleaned.substring(0, 2), 10);
    const mm = parseInt(cleaned.substring(2, 4), 10);
    const dd = parseInt(cleaned.substring(4, 6), 10);

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return -1;

    const currentYear = new Date().getFullYear();
    const century = yy + 2000 <= currentYear ? 2000 : 1900;
    const birthYear = century + yy;

    const today = new Date();
    let age = today.getFullYear() - birthYear;
    const birthDate = new Date(birthYear, mm - 1, dd);
    if (today < new Date(today.getFullYear(), mm - 1, dd)) age--;

    return age;
}

// ─── Factor Scorers ──────────────────────────────────────────────────────────

function scoreAge(age: number): RiskFactorResult {
    const factor = 'Age';
    const maxScore = 20;

    if (age < 0) {
        return { factor, score: 5, maxScore, detail: 'Could not derive age from ID number', flag: 'ID_PARSE_ERROR' };
    }
    if (age < 18) {
        return { factor, score: 20, maxScore, detail: `Age ${age}: Below legal age for credit agreements`, flag: 'UNDERAGE_APPLICANT' };
    }
    if (age > 65) {
        return { factor, score: 15, maxScore, detail: `Age ${age}: Most Credit Life policies cease at age 65 (NCA Reg 3.3)`, flag: 'AGE_LIMIT_BREACH' };
    }
    if (age >= 60) {
        return { factor, score: 10, maxScore, detail: `Age ${age}: Approaching policy age ceiling, increased mortality risk` };
    }
    if (age >= 50) {
        return { factor, score: 5, maxScore, detail: `Age ${age}: Moderate age — standard risk` };
    }
    // 18–49: optimal age band
    return { factor, score: 0, maxScore, detail: `Age ${age}: Within standard underwriting age band (18–49)` };
}

function scoreEmployment(status: EmploymentStatus): RiskFactorResult {
    const factor = 'Employment Status';
    const maxScore = 25;

    switch (status) {
        case 'Employed':
            return { factor, score: 0, maxScore, detail: 'Formally employed — full product eligibility' };
        case 'Self-Employed':
            return { factor, score: 10, maxScore, detail: 'Self-employed — Retrenchment cover not applicable (NCA Reg)', flag: 'RETRENCHMENT_INELIGIBLE' };
        case 'Pensioner':
            return { factor, score: 15, maxScore, detail: 'Pensioner — Retrenchment cover is illegal (NCA violation)', flag: 'RETRENCHMENT_ILLEGAL_NCA' };
        case 'Unemployed':
            return { factor, score: 25, maxScore, detail: 'Unemployed — Credit Life affordability severely compromised', flag: 'UNEMPLOYMENT_HIGH_RISK' };
        default:
            return { factor, score: 8, maxScore, detail: 'Employment status unknown — manual verification required', flag: 'EMPLOYMENT_UNKNOWN' };
    }
}

function scoreDebtToIncome(totalMonthlyInstalment: number, netSalary: number): RiskFactorResult {
    const factor = 'Debt-to-Income Ratio';
    const maxScore = 25;

    if (netSalary <= 0) {
        return { factor, score: 25, maxScore, detail: 'No income recorded — cannot calculate DTI ratio', flag: 'NO_INCOME_DATA' };
    }

    const dti = (totalMonthlyInstalment / netSalary) * 100;
    const dtiFormatted = dti.toFixed(1);

    if (dti < 30) {
        return { factor, score: 0, maxScore, detail: `DTI ${dtiFormatted}% — healthy (below 30%)` };
    }
    if (dti < 50) {
        return { factor, score: 8, maxScore, detail: `DTI ${dtiFormatted}% — moderate (30–50%)` };
    }
    if (dti < 70) {
        return { factor, score: 16, maxScore, detail: `DTI ${dtiFormatted}% — elevated (50–70%), affordability stressed`, flag: 'ELEVATED_DTI' };
    }
    return { factor, score: 25, maxScore, detail: `DTI ${dtiFormatted}% — critical (>70%), likely insolvent without intervention`, flag: 'CRITICAL_DTI' };
}

function scoreAffordability(totalMonthlyInstalment: number, netSalary: number): RiskFactorResult {
    const factor = 'Monthly Surplus';
    const maxScore = 15;

    if (netSalary <= 0) {
        return { factor, score: 15, maxScore, detail: 'Cannot calculate surplus — no salary recorded', flag: 'NO_INCOME_DATA' };
    }

    // Estimate living expenses as 50% of net salary (conservative for SA context)
    const estimatedLivingExpenses = netSalary * 0.50;
    const surplus = netSalary - totalMonthlyInstalment - estimatedLivingExpenses;

    if (surplus > 2000) {
        return { factor, score: 0, maxScore, detail: `Estimated surplus R${surplus.toFixed(0)}/month — comfortable` };
    }
    if (surplus > 500) {
        return { factor, score: 5, maxScore, detail: `Estimated surplus R${surplus.toFixed(0)}/month — tight` };
    }
    if (surplus > 0) {
        return { factor, score: 10, maxScore, detail: `Estimated surplus R${surplus.toFixed(0)}/month — very tight`, flag: 'LOW_SURPLUS' };
    }
    return { factor, score: 15, maxScore, detail: `Estimated deficit R${Math.abs(surplus).toFixed(0)}/month — client is over-indebted`, flag: 'OVER_INDEBTED' };
}

function scoreAccountCount(count: number): RiskFactorResult {
    const factor = 'Active Account Count';
    const maxScore = 10;

    if (count <= 2) {
        return { factor, score: 0, maxScore, detail: `${count} active account(s) — low exposure` };
    }
    if (count <= 5) {
        return { factor, score: 3, maxScore, detail: `${count} active accounts — moderate exposure` };
    }
    if (count <= 10) {
        return { factor, score: 7, maxScore, detail: `${count} active accounts — high exposure, review required` };
    }
    return { factor, score: 10, maxScore, detail: `${count} active accounts — very high; indicative of credit dependency`, flag: 'CREDIT_DEPENDENT' };
}

function scoreBalanceExposure(totalOutstandingBalance: number, netSalary: number): RiskFactorResult {
    const factor = 'Balance-to-Annual-Income Ratio';
    const maxScore = 5;

    if (netSalary <= 0) {
        return { factor, score: 5, maxScore, detail: 'Cannot calculate balance exposure — no salary recorded' };
    }

    const annualSalary = netSalary * 12;
    const ratio = totalOutstandingBalance / annualSalary;

    if (ratio < 1) {
        return { factor, score: 0, maxScore, detail: `Exposure ratio ${ratio.toFixed(2)}x — manageable` };
    }
    if (ratio < 3) {
        return { factor, score: 2, maxScore, detail: `Exposure ratio ${ratio.toFixed(2)}x — moderate` };
    }
    return { factor, score: 5, maxScore, detail: `Exposure ratio ${ratio.toFixed(2)}x — severely over-leveraged`, flag: 'HIGH_LEVERAGE' };
}

// ─── Tier Classifier ─────────────────────────────────────────────────────────

function classifyTier(totalScore: number): RiskTier {
    if (totalScore <= 20) return 'LOW';
    if (totalScore <= 45) return 'MEDIUM';
    if (totalScore <= 65) return 'HIGH';
    return 'VERY_HIGH';
}

function buildSummary(tier: RiskTier, age: number, flags: string[]): string {
    const tierDescriptions: Record<RiskTier, string> = {
        LOW: 'Client presents a low risk profile. Standard terms apply.',
        MEDIUM: 'Client presents a moderate risk profile. Standard terms with possible minor loadings.',
        HIGH: 'Client presents a high risk profile. Manual underwriter review recommended before approval.',
        VERY_HIGH: 'Client presents a very high risk profile. Likely decline or heavy loading unless mitigating factors exist.' };

    let summary = tierDescriptions[tier];

    if (flags.includes('AGE_LIMIT_BREACH')) {
        summary += ` Client age (${age}) exceeds standard policy age ceiling of 65.`;
    }
    if (flags.includes('RETRENCHMENT_ILLEGAL_NCA')) {
        summary += ' Retrenchment cover is a regulatory violation for this client.';
    }
    if (flags.includes('CRITICAL_DTI')) {
        summary += ' Critical debt-to-income ratio — client may be unable to sustain new premiums.';
    }
    if (flags.includes('OVER_INDEBTED')) {
        summary += ' Client appears over-indebted. A debt review referral may be more appropriate than new insurance.';
    }

    return summary;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
    const age = extractAgeFromSAId(input.idNumber);

    const factors: RiskFactorResult[] = [
        scoreAge(age),
        scoreEmployment(input.employmentStatus),
        scoreDebtToIncome(input.totalMonthlyInstalment, input.netSalary),
        scoreAffordability(input.totalMonthlyInstalment, input.netSalary),
        scoreAccountCount(input.activeAccountCount),
        scoreBalanceExposure(input.totalOutstandingBalance, input.netSalary),
    ];

    // Bonus deductions for known mitigation (debt review is a positive signal — client is addressing debt)
    if (input.isInDebtReview) {
        factors.push({
            factor: 'Debt Review Status',
            score: -5,
            maxScore: 0,
            detail: 'Client is actively in debt review — structured repayment reduces default risk' });
    }

    const totalScore = Math.min(100, Math.max(0, factors.reduce((sum, f) => sum + f.score, 0)));
    const tier = classifyTier(totalScore);
    const flags = factors.filter(f => f.flag).map(f => f.flag as string);
    const summary = buildSummary(tier, age, flags);

    return {
        totalScore,
        tier,
        derivedAge: age,
        factors,
        flags,
        summary,
        scoredAt: new Date().toISOString() };
}

/** Helper to derive EmploymentStatus from free-text employer/employment fields */
export function inferEmploymentStatus(
    employer?: string | null,
    grossSalary?: number | null
): EmploymentStatus {
    if (!employer && !grossSalary) return 'Unknown';
    if (employer?.toLowerCase().includes('pension') || employer?.toLowerCase().includes('sassa')) return 'Pensioner';
    if (employer?.toLowerCase().includes('self') || employer?.toLowerCase().includes('own')) return 'Self-Employed';
    if (grossSalary && grossSalary > 0) return 'Employed';
    return 'Unknown';
}
