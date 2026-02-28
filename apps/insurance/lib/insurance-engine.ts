
export type ClientProfile = {
    age: number;
    employmentStatus: 'Employed' | 'Self-Employed' | 'Unemployed' | 'Pensioner';
    occupation?: string;
};

export type Policy = {
    type: 'Credit Life' | 'Funeral' | 'Disability' | 'Retrenchment';
    premium: number;
    benefits: string[];
};

export type LoanDetails = {
    principal: number;
    interestRate: number; // Annual rate (e.g., 10.5 for 10.5%)
    termMonths: number;
    startDate: Date;
    serviceFees: number; // Monthly service fee
};

/**
 * Calculates the amortization schedule of a loan to determine the expected balance 
 * at any given month. This is used to check if insurance premiums are decreasing
 * as the balance decreases (as they should for declining balance policies).
 */
export function calculateDecliningBalance(loan: LoanDetails): { month: number; balance: number; expectedPremiumFactor: number }[] {
    const monthlyRate = loan.interestRate / 100 / 12;
    let balance = loan.principal;
    const schedule = [];

    // Calculate standard monthly installment (PMT)
    const pmt = (loan.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -loan.termMonths));

    for (let month = 1; month <= loan.termMonths; month++) {
        const interest = balance * monthlyRate;
        const principalPayment = pmt - interest;
        balance -= principalPayment;

        if (balance < 0) balance = 0;

        // The "Premium Factor" represents the % of the original loan remaining.
        // E.g., if balance is 50% of original, premium should roughly be 50% of start.
        const expectedPremiumFactor = balance / loan.principal;

        schedule.push({
            month,
            balance: Number(balance.toFixed(2)),
            expectedPremiumFactor: Number(expectedPremiumFactor.toFixed(4))
        });
    }

    return schedule;
}

/**
 * Flags "Junk" insurance policies that are likely illegal or useless for the client.
 * E.g., Retrenchment cover for a Pensioner.
 */
export function identifyJunkCover(client: ClientProfile, policy: Policy): string | null {
    if (policy.type === 'Retrenchment') {
        if (client.employmentStatus === 'Pensioner' || client.employmentStatus === 'Unemployed') {
            return 'Illegal: Retrenchment cover sold to non-employed person (NCA Violation).';
        }
        if (client.employmentStatus === 'Self-Employed') {
            return 'Warning: Retrenchment cover often strictly defines "Employed" - check policy wording.';
        }
    }

    if (policy.type === 'Credit Life') {
        if (client.age > 65) {
            return 'Warning: Check age limit on Credit Life policy (often ceases at 65).';
        }
    }

    return null; // No issues found
}

/**
 * Calculates the potential savings if a client switches to a compliant
 * replacement policy.
 */
export function calculateSavings(currentPremium: number, replacementPremium: number): { monthly: number; annual: number; percent: number } {
    const monthly = currentPremium - replacementPremium;
    if (monthly <= 0) return { monthly: 0, annual: 0, percent: 0 };

    return {
        monthly: Number(monthly.toFixed(2)),
        annual: Number((monthly * 12).toFixed(2)),
        percent: Number(((monthly / currentPremium) * 100).toFixed(1))
    };
}
