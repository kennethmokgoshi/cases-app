import { logger } from '../logger';

export interface SavingsAuditResult {
    monthlySavings: number;
    totalFutureSavings: number;
    historicalLoss: number;
    accounts: Array<{
        creditor: string;
        currentPremium: number;
        dccpPremium: number;
        monthlySaving: number;
        futureSaving: number;
        historicalLoss: number;
    }>;
    referralCommission: number;
}

/**
 * DCCP Savings Engine
 * Logic to calculate consumer savings and DC commissions
 */
export function calculateSavingsAudit(accounts: any[]): SavingsAuditResult {
    const result: SavingsAuditResult = {
        monthlySavings: 0,
        totalFutureSavings: 0,
        historicalLoss: 0,
        accounts: [],
        referralCommission: 0
    };

    // DCCP Credit Life Estimate Rate: R3.50 per R1000 of balance
    // Industry standard is usually R4.50 per R1000.
    const DCCP_CREDIT_LIFE_RATE = 3.5 / 1000;
    const REFERRAL_FEE_PERCENTAGE = 0.40;

    accounts.forEach(acc => {
        if (!acc.balance || acc.balance <= 0) return;

        const currentPremium = acc.insurancePremium || 0;
        
        // Estimate DCCP Premium
        let dccpPremium = acc.balance * DCCP_CREDIT_LIFE_RATE;
        
        // Ensure DCCP premium isn't higher than current (to be safe in the audit)
        if (currentPremium > 0 && dccpPremium > currentPremium) {
            dccpPremium = currentPremium * 0.8; // Assume at least 20% saving if we recommend switching
        }

        const monthlySaving = Math.max(0, currentPremium - dccpPremium);
        
        // Calculate terms
        const remainingMonths = acc.remainingMonths || 0;
        const futureSaving = monthlySaving * remainingMonths;

        // Calculate historical loss (if start date is known)
        let historicalLoss = 0;
        if (acc.contractStart && acc.contractStart !== 'NA') {
            const start = new Date(acc.contractStart);
            const now = new Date();
            const monthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
            if (monthsPassed > 0) {
                historicalLoss = monthlySaving * monthsPassed;
            }
        }

        result.accounts.push({
            creditor: acc.creditor,
            currentPremium,
            dccpPremium,
            monthlySaving,
            futureSaving,
            historicalLoss
        });

        result.monthlySavings += monthlySaving;
        result.totalFutureSavings += futureSaving;
        result.historicalLoss += historicalLoss;
        result.referralCommission += (dccpPremium * REFERRAL_FEE_PERCENTAGE);
    });

    return result;
}
