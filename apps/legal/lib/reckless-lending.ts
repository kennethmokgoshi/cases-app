
export interface AffordabilityInput {
    loanAmount: number;
    instalment: number; // Offered monthly instalment
    declaredIncome: number;
    declaredExpenses: number;
    trueExpenses: number; // Discovered via Bank Statements (AI)
    existingDebtObligations: number;
}

export interface AssessmentResult {
    isReckless: boolean;
    reason: string;
    availableSurplus: number;
    confidence: number;
}

/**
 * AI Logic to determine if a credit agreement was reckless at inception.
 * Section 80(1)(a) of the NCA: Did the consumer understand the risks?
 * Section 80(1)(b): Did the credit make the consumer over-indebted?
 */
export function assessRecklessLending(data: AffordabilityInput): AssessmentResult {
    // 1. Calculate True Surplus
    // Surplus = Income - (Living Expenses + Existing Debt)
    const trueSurplus = data.declaredIncome - (data.trueExpenses + data.existingDebtObligations);

    // 2. Can they afford the NEW instalment?
    // If Surplus < New Instalment, they are over-indebted immediately -> RECKLESS
    const deficit = trueSurplus - data.instalment;

    if (deficit < 0) {
        return {
            isReckless: true,
            reason: `Consumer had a deficit of R${Math.abs(deficit).toFixed(2)} at inception. Granting credit was reckless as per Section 80(1)(b)(ii).`,
            availableSurplus: trueSurplus,
            confidence: 0.98
        };
    }

    // 3. Significant Discrepancy Check (Fraud / Negligence)
    // If Declared Expenses were significantly lower than True Expenses (e.g. by > 20%), 
    // the credit provider failed to conduct a proper assessment.
    const expenseDiscrepancy = data.trueExpenses - data.declaredExpenses;
    if (expenseDiscrepancy > (data.declaredExpenses * 0.2)) {
        return {
            isReckless: true,
            reason: `Credit Provider failed to verify true living expenses. Variance of R${expenseDiscrepancy.toFixed(2)} detected vs declared amount.`,
            availableSurplus: trueSurplus,
            confidence: 0.85
        };
    }

    return {
        isReckless: false,
        reason: 'Assessment indicates consumer had sufficient surplus at inception.',
        availableSurplus: trueSurplus,
        confidence: 0.90
    };
}
