
// Import logic from the Legal App (assuming monorepo access or shared lib)
// For now, we'll duplicate the logic to ensure independence as requested,
// or if we were in a real monorepo, we'd import from a shared package.
// We will clone the logic here to guarantee the "Clean Slate" independence user requested.

import {
    checkRecklessLending,
    isInterestRateCompliant,
    validateExpenses,
    type FinancialProfile,
    type LoanApplication } from './affordability-engine';

/**
 * RECKLESS LENDING ENGINE (Cloned for Forensic Context)
 */
export function assessAffordability(income: number, expenses: number, debtObligations: number, newInstalment: number) {
    const trueSurplus = income - (expenses + debtObligations);
    const deficit = trueSurplus - newInstalment;

    if (deficit < 0) {
        return {
            isReckless: true,
            riskLevel: 'HIGH',
            reason: `Consumer had a deficit of R${Math.abs(deficit).toFixed(2)} at inception.`,
            deficit
        };
    }
    return { isReckless: false, riskLevel: 'LOW', deficit };
}

/**
 * PRESCRIPTION ENGINE (Cloned for Forensic Context)
 */
export function checkPrescriptionStatus(lastPaymentDate: Date, summsonsIssued: boolean) {
    const today = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(today.getFullYear() - 3);

    if (!summsonsIssued && lastPaymentDate < threeYearsAgo) {
        return {
            isPrescribed: true,
            riskLevel: 'CRITICAL',
            reason: 'Debt is older than 3 years with no interruption.'
        };
    }
    return { isPrescribed: false, riskLevel: 'LOW' };
}

/**
 * MAIN FORENSIC AGENT (legacy — kept for backwards compatibility)
 */
export function runForensicAudit(data: any) {
    const findings = [];
    let riskScore = 0;

    // 1. Run Prescription Check
    if (data.ledger) {
        const pCheck = checkPrescriptionStatus(new Date(data.ledger.lastPayment), false);
        if (pCheck.isPrescribed) {
            findings.push({ type: 'PRESCRIPTION', severity: 'CRITICAL', message: pCheck.reason });
            riskScore += 50;
        }
    }

    // 2. Run Affordability Check
    if (data.affordability) {
        const aCheck = assessAffordability(
            data.affordability.income,
            data.affordability.livingExpenses,
            data.affordability.debtRepayments,
            data.agreement.instalment
        );
        if (aCheck.isReckless) {
            findings.push({ type: 'RECKLESS_LENDING', severity: 'HIGH', message: aCheck.reason });
            riskScore += 40;
        }
    }

    return {
        caseId: data.caseId,
        findings,
        totalRiskScore: riskScore,
        recommendedAction: riskScore > 40 ? 'INITIATE_SECTION_80_DEFENSE' : 'MONITOR'
    };
}

// ─────────────────────────────────────────────────────────
// MULTI-ACCOUNT FORENSIC ENGINE (v2)
// ─────────────────────────────────────────────────────────

export type AccountFinding = {
    accountId: string
    creditorName: string
    accountType: string
    outstandingBalance: number
    checks: {
        prescription: { flagged: boolean; reason?: string; riskScore: number }
        recklessLending: { flagged: boolean; reason?: string; riskScore: number; disposableIncome?: number; shortfall?: number }
        interestRate: { flagged: boolean; reason?: string; riskScore: number; actualRate?: number; maxRate?: number }
        insurancePremium: { flagged: boolean; reason?: string; riskScore: number; premiumRate?: number; benchmarkMax?: number }
    }
    accountRiskScore: number
}

export type RateTableEntry = {
    creditorName: string
    accountType: string
    maxRate: number
}

export type FullAuditInput = {
    caseId: string
    clientName: string
    accounts: Array<{
        id: string
        creditorName: string
        accountType: string
        outstandingBalance: number
        monthlyInstalment: number | null
        interestRate: number | null
        originalAmount: number | null
        lastPaymentDate: Date | null
        isPrescribed: boolean
        premiumRate: number | null
        premiumSource: string
    }>
    rateTable: RateTableEntry[]
    financialProfile: FinancialProfile
    repoRate: number
}

export type FullAuditResult = {
    caseId: string
    clientName: string
    totalAccounts: number
    totalRiskScore: number
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    accountFindings: AccountFinding[]
    summaryFindings: Array<{ type: string; severity: string; message: string }>
    recommendedAction: string
    section80Eligible: boolean
    runAt: Date
}

/**
 * Analyse a single credit account against all forensic checks.
 */
export function analyzeAccount(
    account: FullAuditInput['accounts'][number],
    financialProfile: FinancialProfile,
    repoRate: number,
    rateTable: RateTableEntry[],
): AccountFinding {
    const checks: AccountFinding['checks'] = {
        prescription: { flagged: false, riskScore: 0 },
        recklessLending: { flagged: false, riskScore: 0 },
        interestRate: { flagged: false, riskScore: 0 },
        insurancePremium: { flagged: false, riskScore: 0 } };

    // 1. Prescription check
    if (account.lastPaymentDate && !account.isPrescribed) {
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        if (account.lastPaymentDate < threeYearsAgo) {
            checks.prescription = {
                flagged: true,
                reason: `Last payment was ${account.lastPaymentDate.toLocaleDateString('en-ZA')} — over 3 years ago with no recorded summons interruption. Debt may be prescribed under NCA Section 126B.`,
                riskScore: 40 };
        }
    }

    // 2. Reckless lending check (only if we have an instalment)
    if (account.monthlyInstalment !== null && account.monthlyInstalment > 0) {
        const loan: LoanApplication = {
            amount: account.originalAmount ?? account.outstandingBalance,
            installment: account.monthlyInstalment,
            interestRate: account.interestRate ?? 0,
            agreementDate: account.lastPaymentDate ?? new Date(),
            repoRateAtInception: repoRate };
        const expenseCheck = validateExpenses(financialProfile);
        const rlCheck = checkRecklessLending(financialProfile, loan);
        if (rlCheck.isReckless) {
            checks.recklessLending = {
                flagged: true,
                reason: rlCheck.reason ?? `Reckless lending: disposable income R${rlCheck.disposableIncome.toFixed(2)}, instalment R${account.monthlyInstalment.toFixed(2)}.`,
                riskScore: 35,
                disposableIncome: rlCheck.disposableIncome,
                shortfall: rlCheck.shortfall };
        } else if (!expenseCheck.isValid) {
            // Expenses were shaved — still flag as medium risk
            checks.recklessLending = {
                flagged: true,
                reason: expenseCheck.warning ?? 'Declared expenses below NCR minimum — potential expense manipulation at credit application.',
                riskScore: 20,
                disposableIncome: rlCheck.disposableIncome,
                shortfall: 0 };
        }
    }

    // 3. Interest rate compliance
    if (account.interestRate !== null && account.interestRate > 0) {
        const loan: LoanApplication = {
            amount: account.originalAmount ?? account.outstandingBalance,
            installment: account.monthlyInstalment ?? 0,
            interestRate: account.interestRate,
            agreementDate: account.lastPaymentDate ?? new Date(),
            repoRateAtInception: repoRate };
        const rateCheck = isInterestRateCompliant(loan);
        if (!rateCheck.isCompliant) {
            checks.interestRate = {
                flagged: true,
                reason: `Interest rate ${account.interestRate}% exceeds NCA maximum of ${rateCheck.maxRate}% (Repo ${repoRate}% + 21%). Excess interest may be reclaimed.`,
                riskScore: 25,
                actualRate: account.interestRate,
                maxRate: rateCheck.maxRate };
        }
    }

    // 4. Insurance premium compliance (compare against CreditLifeRateTable)
    if (account.premiumRate !== null && account.premiumRate > 0) {
        // Find the benchmark for this creditor+accountType combo
        const benchmark = rateTable.find(
            r =>
                r.creditorName.toLowerCase() === account.creditorName.toLowerCase() &&
                r.accountType.toLowerCase() === account.accountType.toLowerCase()
        ) ?? rateTable.find(r => r.accountType.toLowerCase() === account.accountType.toLowerCase());

        if (benchmark && account.premiumRate > benchmark.maxRate) {
            checks.insurancePremium = {
                flagged: true,
                reason: `Insurance premium rate ${account.premiumRate.toFixed(2)}% exceeds benchmark maximum of ${benchmark.maxRate.toFixed(2)}% for ${account.accountType} accounts. Excess premium charged: ${(account.premiumRate - benchmark.maxRate).toFixed(2)}%.`,
                riskScore: 20,
                premiumRate: account.premiumRate,
                benchmarkMax: benchmark.maxRate };
        }
    }

    const accountRiskScore =
        checks.prescription.riskScore +
        checks.recklessLending.riskScore +
        checks.interestRate.riskScore +
        checks.insurancePremium.riskScore;

    return {
        accountId: account.id,
        creditorName: account.creditorName,
        accountType: account.accountType,
        outstandingBalance: account.outstandingBalance,
        checks,
        accountRiskScore };
}

/**
 * Run a full multi-account forensic audit for a case.
 */
export function runFullForensicAudit(input: FullAuditInput): FullAuditResult {
    const accountFindings: AccountFinding[] = input.accounts.map(account =>
        analyzeAccount(account, input.financialProfile, input.repoRate, input.rateTable)
    );

    const totalRiskScore = Math.min(
        100,
        accountFindings.reduce((sum, af) => sum + af.accountRiskScore, 0)
    );

    const riskLevel: FullAuditResult['riskLevel'] =
        totalRiskScore >= 81 ? 'CRITICAL' :
        totalRiskScore >= 61 ? 'HIGH' :
        totalRiskScore >= 31 ? 'MEDIUM' : 'LOW';

    // Build human-readable summary findings
    const summaryFindings: FullAuditResult['summaryFindings'] = [];

    for (const af of accountFindings) {
        if (af.checks.prescription.flagged) {
            summaryFindings.push({
                type: 'PRESCRIPTION',
                severity: 'CRITICAL',
                message: `${af.creditorName} — ${af.checks.prescription.reason}` });
        }
        if (af.checks.recklessLending.flagged) {
            summaryFindings.push({
                type: 'RECKLESS_LENDING',
                severity: af.checks.recklessLending.riskScore >= 35 ? 'HIGH' : 'MEDIUM',
                message: `${af.creditorName} — ${af.checks.recklessLending.reason}` });
        }
        if (af.checks.interestRate.flagged) {
            summaryFindings.push({
                type: 'INTEREST_RATE',
                severity: 'HIGH',
                message: `${af.creditorName} — ${af.checks.interestRate.reason}` });
        }
        if (af.checks.insurancePremium.flagged) {
            summaryFindings.push({
                type: 'INSURANCE_PREMIUM',
                severity: 'MEDIUM',
                message: `${af.creditorName} — ${af.checks.insurancePremium.reason}` });
        }
    }

    const section80Eligible = accountFindings.some(af => af.checks.recklessLending.flagged && af.checks.recklessLending.riskScore >= 35);
    const hasPrescription = summaryFindings.some(f => f.type === 'PRESCRIPTION');
    const hasInterestViolation = summaryFindings.some(f => f.type === 'INTEREST_RATE');

    let recommendedAction = 'MONITOR — No significant forensic findings detected.';
    if (riskLevel === 'CRITICAL' || section80Eligible) {
        recommendedAction = 'INITIATE SECTION 80 DEFENSE — Reckless lending proven. Consumer may apply for debt to be declared reckless under NCA Section 80.';
    } else if (hasPrescription) {
        recommendedAction = 'RAISE PRESCRIPTION PLEA — One or more debts appear prescribed. Raise prescription defense in any legal proceedings.';
    } else if (hasInterestViolation) {
        recommendedAction = 'CLAIM EXCESS INTEREST — Interest rates exceed NCA limits. File complaint with NCR and seek refund of excess interest charged.';
    } else if (riskLevel === 'HIGH') {
        recommendedAction = 'ESCALATE FOR REVIEW — Multiple medium-risk findings detected. Recommend senior auditor review before proceeding.';
    }

    return {
        caseId: input.caseId,
        clientName: input.clientName,
        totalAccounts: input.accounts.length,
        totalRiskScore,
        riskLevel,
        accountFindings,
        summaryFindings,
        recommendedAction,
        section80Eligible,
        runAt: new Date() };
}
