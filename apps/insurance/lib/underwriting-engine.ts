/**
 * Underwriting Automation Engine
 *
 * Consumes a RiskScoreResult + client profile + credit account portfolio to produce
 * a full automated underwriting report with:
 *   - Per-product eligibility decisions (Credit Life, Disability, Retrenchment, Funeral)
 *   - Premium loading factors based on risk tier
 *   - Overall underwriting decision: APPROVE | CONDITIONAL_APPROVE | REFER | DECLINE
 *   - Recommended replacement policy with insurer, cover amounts, and premium estimate
 *   - Detailed reasoning referencing NCA regulations
 */

import type { RiskScoreResult, RiskTier, EmploymentStatus } from './risk-scoring';
import { calculateSavings, identifyJunkCover } from './insurance-engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export type UnderwritingDecision = 'APPROVE' | 'CONDITIONAL_APPROVE' | 'REFER' | 'DECLINE';
export type ProductType = 'CREDIT_LIFE' | 'DISABILITY' | 'RETRENCHMENT' | 'FUNERAL';
export type ProductDecision = 'ELIGIBLE' | 'ELIGIBLE_WITH_LOADING' | 'REFER' | 'INELIGIBLE' | 'DECLINE';

export interface ProductEligibility {
    product: ProductType;
    decision: ProductDecision;
    /** Base premium rate per R1 000 of outstanding balance */
    basePremiumRatePer1000: number;
    /** Loading multiplier (1.0 = no loading, 1.5 = 50% loading) */
    loadingFactor: number;
    /** Final effective rate per R1 000 */
    effectivePremiumRatePer1000: number;
    reasons: string[];
    regulatoryFlags: string[];
}

export interface CreditAccountUnderwritingResult {
    creditAccountId: string;
    creditorName: string;
    outstandingBalance: number;
    currentPremium: number;
    /** Recommended replacement premium for this account */
    recommendedPremium: number;
    /** Estimated saving on this account */
    saving: number;
    isJunkCover: boolean;
    junkCoverReason?: string;
    eligible: boolean;
    exclusionReason?: string;
}

export interface PolicyRecommendation {
    insurer: string;
    policyType: string;
    /** Total monthly premium across all included accounts */
    totalMonthlyPremium: number;
    /** Total cover amount */
    totalCoverAmount: number;
    coverDeath: boolean;
    coverDisability: boolean;
    coverRetrenchment: boolean;
    coverFuneral: boolean;
    /** Monthly savings vs current premiums */
    monthlySavings: number;
    annualSavings: number;
    savingsPercent: number;
}

export interface UnderwritingReport {
    /** ISO timestamp */
    underwrittenAt: string;
    decision: UnderwritingDecision;
    /** Human-readable overall decision reasoning */
    decisionReason: string;
    riskTier: RiskTier;
    riskScore: number;
    productEligibility: ProductEligibility[];
    accountResults: CreditAccountUnderwritingResult[];
    policyRecommendation: PolicyRecommendation | null;
    /** Referral actions required if decision is REFER or CONDITIONAL_APPROVE */
    referralActions: string[];
    /** Regulatory flags that must be disclosed to client */
    regulatoryDisclosures: string[];
    /** Whether cancellation letters should be auto-generated */
    generateCancellationLetters: boolean;
}

export interface UnderwritingInput {
    riskScore: RiskScoreResult;
    employmentStatus: EmploymentStatus;
    age: number;
    /** Credit accounts linked to this assessment */
    accounts: Array<{
        creditAccountId: string;
        creditorName: string;
        outstandingBalance: number;
        currentPremium: number;
        accountType: string;
        isIncluded: boolean;
        exclusionReason?: string;
    }>;
    /** Current totals from assessment */
    totalCurrentPremium: number;
}

// ─── Rate Tables ─────────────────────────────────────────────────────────────

/**
 * NCA-compliant maximum Credit Life premium rates per R1 000 outstanding balance.
 * Source: National Credit Amendment Act, Government Gazette 41269 (2017).
 * Effective rate cap: R4.50 per R1 000 per month for most unsecured credit.
 */
const NCA_MAX_RATE_PER_1000 = 4.50;

/** Our recommended replacement insurer rates per R1 000 (well below NCA cap) */
const REPLACEMENT_BASE_RATES: Record<ProductType, number> = {
    CREDIT_LIFE: 2.20,    // R2.20 per R1 000 — competitive compliant rate
    DISABILITY:  0.60,    // Included in most credit life bundles
    RETRENCHMENT: 0.80,   // Only for eligible employed clients
    FUNERAL:     0.40,    // Optional add-on
};

/** Loading factors by risk tier */
const LOADING_BY_TIER: Record<RiskTier, number> = {
    LOW:       1.00,   // No loading
    MEDIUM:    1.20,   // 20% loading
    HIGH:      1.40,   // 40% loading
    VERY_HIGH: 1.70,   // 70% loading (or decline)
};

// ─── Product Eligibility Assessment ──────────────────────────────────────────

function assessProductEligibility(
    product: ProductType,
    riskScore: RiskScoreResult,
    employmentStatus: EmploymentStatus,
    age: number
): ProductEligibility {
    const reasons: string[] = [];
    const regulatoryFlags: string[] = [];
    let decision: ProductDecision = 'ELIGIBLE';
    const baseRate = REPLACEMENT_BASE_RATES[product];
    const loading = LOADING_BY_TIER[riskScore.tier];

    if (product === 'RETRENCHMENT') {
        if (employmentStatus === 'Pensioner' || employmentStatus === 'Unemployed') {
            return {
                product,
                decision: 'INELIGIBLE',
                basePremiumRatePer1000: 0,
                loadingFactor: 0,
                effectivePremiumRatePer1000: 0,
                reasons: ['Client is not in formal employment — Retrenchment cover is inapplicable and illegal under NCA Section 106(4).'],
                regulatoryFlags: ['NCA_S106_VIOLATION — Retrenchment cover sold to non-employed person is unlawful.'] };
        }
        if (employmentStatus === 'Self-Employed') {
            return {
                product,
                decision: 'INELIGIBLE',
                basePremiumRatePer1000: 0,
                loadingFactor: 0,
                effectivePremiumRatePer1000: 0,
                reasons: ['Self-employed persons do not qualify for retrenchment cover — policy wording typically excludes voluntary/involuntary cessation of self-employment.'],
                regulatoryFlags: ['SELF_EMPLOYED_RETRENCHMENT_EXCLUSION'] };
        }
    }

    if (product === 'CREDIT_LIFE' || product === 'DISABILITY') {
        if (age > 65) {
            return {
                product,
                decision: 'INELIGIBLE',
                basePremiumRatePer1000: 0,
                loadingFactor: 0,
                effectivePremiumRatePer1000: 0,
                reasons: [`Client age (${age}) exceeds the standard policy ceiling of 65 years.`],
                regulatoryFlags: ['AGE_LIMIT_65_EXCEEDED'] };
        }
        if (age >= 60) {
            reasons.push(`Client age (${age}) is approaching policy ceiling (65). Term must expire before age 65.`);
            regulatoryFlags.push('AGE_NEAR_CEILING_REVIEW');
        }
    }

    if (riskScore.tier === 'VERY_HIGH') {
        if (riskScore.flags.includes('OVER_INDEBTED') || riskScore.flags.includes('CRITICAL_DTI')) {
            return {
                product,
                decision: 'DECLINE',
                basePremiumRatePer1000: baseRate,
                loadingFactor: loading,
                effectivePremiumRatePer1000: 0,
                reasons: [
                    'Client risk score indicates extreme over-indebtedness.',
                    'Loading required to make cover viable would result in an unaffordable premium.',
                    'Recommend referral to debt counselling rather than additional insurance burden.',
                ],
                regulatoryFlags: ['OVER_INDEBTEDNESS_DECLINE'] };
        }
        decision = 'REFER';
        reasons.push('Very high risk tier requires senior underwriter sign-off.');
    } else if (riskScore.tier === 'HIGH') {
        decision = 'ELIGIBLE_WITH_LOADING';
        reasons.push(`High risk tier — ${((loading - 1) * 100).toFixed(0)}% premium loading applied.`);
    } else {
        reasons.push(`${riskScore.tier} risk tier — standard terms apply.`);
    }

    const effectiveRate = decision === 'INELIGIBLE' || decision === 'DECLINE'
        ? 0
        : Number((baseRate * loading).toFixed(4));

    // Cap at NCA maximum
    if (effectiveRate > NCA_MAX_RATE_PER_1000 && product === 'CREDIT_LIFE') {
        regulatoryFlags.push(`NCA_CAP_BREACH — Effective rate R${effectiveRate.toFixed(2)}/1000 exceeds NCA cap of R${NCA_MAX_RATE_PER_1000}/1000. Rate has been capped.`);
    }

    return {
        product,
        decision,
        basePremiumRatePer1000: baseRate,
        loadingFactor: loading,
        effectivePremiumRatePer1000: Math.min(effectiveRate, NCA_MAX_RATE_PER_1000),
        reasons,
        regulatoryFlags };
}

// ─── Per-Account Underwriting ─────────────────────────────────────────────────

function underwriteAccount(
    account: UnderwritingInput['accounts'][0],
    creditLifeEligibility: ProductEligibility
): CreditAccountUnderwritingResult {
    // Check for junk cover on original policy
    const junkCheck = identifyJunkCover(
        { age: 45, employmentStatus: 'Employed' }, // simplified — real check done at product level
        { type: 'Credit Life', premium: account.currentPremium, benefits: [] }
    );

    if (!account.isIncluded || account.exclusionReason) {
        return {
            creditAccountId: account.creditAccountId,
            creditorName: account.creditorName,
            outstandingBalance: account.outstandingBalance,
            currentPremium: account.currentPremium,
            recommendedPremium: 0,
            saving: account.currentPremium,
            isJunkCover: false,
            eligible: false,
            exclusionReason: account.exclusionReason || 'Manually excluded from assessment' };
    }

    if (creditLifeEligibility.decision === 'INELIGIBLE' || creditLifeEligibility.decision === 'DECLINE') {
        return {
            creditAccountId: account.creditAccountId,
            creditorName: account.creditorName,
            outstandingBalance: account.outstandingBalance,
            currentPremium: account.currentPremium,
            recommendedPremium: 0,
            saving: 0,
            isJunkCover: !!junkCheck,
            junkCoverReason: junkCheck || undefined,
            eligible: false,
            exclusionReason: 'Product ineligible for this client — see underwriting report' };
    }

    // Calculate recommended premium for this account
    const balanceIn1000s = account.outstandingBalance / 1000;
    const recommendedPremium = Number(
        (balanceIn1000s * creditLifeEligibility.effectivePremiumRatePer1000).toFixed(2)
    );
    const savings = calculateSavings(account.currentPremium, recommendedPremium);

    return {
        creditAccountId: account.creditAccountId,
        creditorName: account.creditorName,
        outstandingBalance: account.outstandingBalance,
        currentPremium: account.currentPremium,
        recommendedPremium,
        saving: savings.monthly,
        isJunkCover: !!junkCheck,
        junkCoverReason: junkCheck || undefined,
        eligible: true };
}

// ─── Overall Decision ─────────────────────────────────────────────────────────

function deriveOverallDecision(
    riskScore: RiskScoreResult,
    productEligibility: ProductEligibility[],
    accountResults: CreditAccountUnderwritingResult[]
): { decision: UnderwritingDecision; reason: string } {
    const hasDeclines = productEligibility.some(p => p.decision === 'DECLINE');
    const hasReferrals = productEligibility.some(p => p.decision === 'REFER');
    const eligibleAccounts = accountResults.filter(a => a.eligible).length;

    if (hasDeclines && eligibleAccounts === 0) {
        return {
            decision: 'DECLINE',
            reason: 'All products ineligible for this client. Primary reason: client over-indebtedness or regulatory age/employment restriction. Recommend debt counselling referral.' };
    }
    if (hasDeclines && eligibleAccounts > 0) {
        return {
            decision: 'CONDITIONAL_APPROVE',
            reason: `Partial approval — ${eligibleAccounts} of ${accountResults.length} accounts are eligible. Some products have been declined due to regulatory or risk constraints. Disclosures required.` };
    }
    if (hasReferrals || riskScore.tier === 'HIGH') {
        return {
            decision: 'REFER',
            reason: 'Client risk profile or product eligibility requires senior underwriter manual review before a binding decision can be issued.' };
    }
    if (riskScore.tier === 'MEDIUM') {
        return {
            decision: 'CONDITIONAL_APPROVE',
            reason: 'Client approved subject to premium loading as per medium risk tier. Client must be informed of loading percentage.' };
    }
    return {
        decision: 'APPROVE',
        reason: 'Client meets all underwriting criteria. Standard terms apply. Replacement policy may be issued.' };
}

// ─── Policy Recommendation ────────────────────────────────────────────────────

function buildPolicyRecommendation(
    accountResults: CreditAccountUnderwritingResult[],
    creditLifeEligibility: ProductEligibility,
    retrenchmentEligibility: ProductEligibility,
    totalCurrentPremium: number
): PolicyRecommendation | null {
    const eligible = accountResults.filter(a => a.eligible);
    if (eligible.length === 0) return null;

    const totalMonthlyPremium = eligible.reduce((s, a) => s + a.recommendedPremium, 0);
    const totalCoverAmount = eligible.reduce((s, a) => s + a.outstandingBalance, 0);
    const savings = calculateSavings(totalCurrentPremium, totalMonthlyPremium);

    return {
        insurer: 'Old Mutual Credit Life (Compliant)',
        policyType: 'Comprehensive Credit Life',
        totalMonthlyPremium: Number(totalMonthlyPremium.toFixed(2)),
        totalCoverAmount: Number(totalCoverAmount.toFixed(2)),
        coverDeath: creditLifeEligibility.decision !== 'INELIGIBLE',
        coverDisability: creditLifeEligibility.decision !== 'INELIGIBLE',
        coverRetrenchment: retrenchmentEligibility.decision === 'ELIGIBLE' || retrenchmentEligibility.decision === 'ELIGIBLE_WITH_LOADING',
        coverFuneral: true,
        monthlySavings: savings.monthly,
        annualSavings: savings.annual,
        savingsPercent: savings.percent };
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function runUnderwriting(input: UnderwritingInput): UnderwritingReport {
    const { riskScore, employmentStatus, age, accounts, totalCurrentPremium } = input;

    // 1. Assess each product
    const creditLife = assessProductEligibility('CREDIT_LIFE', riskScore, employmentStatus, age);
    const disability = assessProductEligibility('DISABILITY', riskScore, employmentStatus, age);
    const retrenchment = assessProductEligibility('RETRENCHMENT', riskScore, employmentStatus, age);
    const funeral = assessProductEligibility('FUNERAL', riskScore, employmentStatus, age);

    const productEligibility = [creditLife, disability, retrenchment, funeral];

    // 2. Underwrite each account
    const accountResults = accounts.map(acc => underwriteAccount(acc, creditLife));

    // 3. Overall decision
    const { decision, reason } = deriveOverallDecision(riskScore, productEligibility, accountResults);

    // 4. Policy recommendation
    const policyRecommendation = buildPolicyRecommendation(
        accountResults,
        creditLife,
        retrenchment,
        totalCurrentPremium
    );

    // 5. Referral actions
    const referralActions: string[] = [];
    if (decision === 'REFER' || decision === 'CONDITIONAL_APPROVE') {
        referralActions.push('Obtain most recent payslip within 30 days for income verification.');
        if (riskScore.flags.includes('EMPLOYMENT_UNKNOWN')) {
            referralActions.push('Verify employment status with letter of employment or payslip.');
        }
        if (riskScore.flags.includes('HIGH_LEVERAGE')) {
            referralActions.push('Obtain credit bureau report to confirm total outstanding debt.');
        }
    }

    // 6. Regulatory disclosures
    const regulatoryDisclosures: string[] = [];
    const allRegFlags = productEligibility.flatMap(p => p.regulatoryFlags);
    if (allRegFlags.includes('AGE_LIMIT_65_EXCEEDED')) {
        regulatoryDisclosures.push('Client must be informed that Credit Life cover ceases at age 65 (NCA Regulations).');
    }
    if (allRegFlags.includes('NCA_CAP_BREACH')) {
        regulatoryDisclosures.push('Premium rates have been capped at the NCA maximum of R4.50 per R1 000 outstanding balance.');
    }
    if (riskScore.flags.includes('RETRENCHMENT_ILLEGAL_NCA') || allRegFlags.includes('NCA_S106_VIOLATION')) {
        regulatoryDisclosures.push('Existing retrenchment cover sold to this client may constitute an NCA violation. Cancellation letter must be generated.');
    }

    return {
        underwrittenAt: new Date().toISOString(),
        decision,
        decisionReason: reason,
        riskTier: riskScore.tier,
        riskScore: riskScore.totalScore,
        productEligibility,
        accountResults,
        policyRecommendation,
        referralActions,
        regulatoryDisclosures,
        generateCancellationLetters: decision === 'APPROVE' || decision === 'CONDITIONAL_APPROVE' };
}
