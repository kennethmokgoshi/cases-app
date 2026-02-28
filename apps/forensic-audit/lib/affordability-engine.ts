
// NCR Household Mean Index (Simplified 2026 Projections)
const NCR_MINIMUM_EXPENSES = {
    single: 3500,
    couple: 5500,
    family_one_child: 7500,
    family_two_children: 9500 };

export type FinancialProfile = {
    grossIncome: number;
    netIncome: number;
    declaredExpenses: number;
    householdSize: number; // 1 = Single, 2 = Couple, etc.
    existingDebtInstallments: number;
};

export type LoanApplication = {
    amount: number;
    installment: number;
    interestRate: number;
    agreementDate: Date;
    repoRateAtInception: number; // e.g., 8.25
};

/**
 * Validates declared expenses against the NCR Household Mean Index.
 * Returns a warning if expenses are significantly lower than the norm,
 * suggesting the lender may have "shaved" expenses to approve the loan.
 */
export function validateExpenses(profile: FinancialProfile): { isValid: boolean; minimumExpected: number; warning?: string } {
    let minExpected = NCR_MINIMUM_EXPENSES.single;

    if (profile.householdSize === 2) minExpected = NCR_MINIMUM_EXPENSES.couple;
    else if (profile.householdSize === 3) minExpected = NCR_MINIMUM_EXPENSES.family_one_child;
    else if (profile.householdSize >= 4) minExpected = NCR_MINIMUM_EXPENSES.family_two_children;

    if (profile.declaredExpenses < minExpected) {
        return {
            isValid: false,
            minimumExpected: minExpected,
            warning: `Declared expenses (R${profile.declaredExpenses}) are below NCR Minimum Norm (R${minExpected}). Potential reckless lending.`
        };
    }

    return { isValid: true, minimumExpected: minExpected };
}

/**
 * Checks if a loan was reckless based on affordability.
 * A loan is reckless if: (Net Income - Living Expenses - Existing Debt) < New Installment
 */
export function checkRecklessLending(profile: FinancialProfile, loan: LoanApplication): { isReckless: boolean; disposableIncome: number; shortfall: number; reason?: string } {
    // Use the HIGHER of declared or minimum expenses for the test
    const { minimumExpected } = validateExpenses(profile);
    const trueExpenses = Math.max(profile.declaredExpenses, minimumExpected);

    const disposableIncome = profile.netIncome - trueExpenses - profile.existingDebtInstallments;
    const shortfall = loan.installment - disposableIncome;

    if (disposableIncome < loan.installment) {
        return {
            isReckless: true,
            disposableIncome,
            shortfall,
            reason: `Client had R${disposableIncome.toFixed(2)} disposable income but was given an installment of R${loan.installment.toFixed(2)}.`
        };
    }

    return {
        isReckless: false,
        disposableIncome,
        shortfall: 0
    };
}

/**
 * Checks if the interest rate exceeds the legal maximum.
 * NCA Formula for Unsecured Credit (example): Repo Rate + 21%
 */
export function isInterestRateCompliant(loan: LoanApplication): { isCompliant: boolean; maxRate: number; rate?: number } {
    const MAX_MARGIN = 21.0; // Example margin for Unsecured Credit
    const maxRate = loan.repoRateAtInception + MAX_MARGIN; // Repo (e.g., 8.25) + 21 = 29.25%

    if (loan.interestRate > maxRate) {
        return {
            isCompliant: false,
            maxRate: Number(maxRate.toFixed(2)),
            rate: loan.interestRate
        };
    }

    return { isCompliant: true, maxRate: Number(maxRate.toFixed(2)) };
}
