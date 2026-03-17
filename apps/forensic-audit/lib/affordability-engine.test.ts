import { describe, it, expect } from 'vitest';
import {
    validateExpenses,
    checkRecklessLending,
    isInterestRateCompliant,
    type FinancialProfile,
    type LoanApplication,
} from './affordability-engine';

// ─── validateExpenses ─────────────────────────────────────────────────────────

describe('validateExpenses', () => {
    it('passes for a single person with declared expenses above minimum (R3500)', () => {
        const profile: FinancialProfile = {
            grossIncome: 30000,
            netIncome: 22000,
            declaredExpenses: 4000,
            householdSize: 1,
            existingDebtInstallments: 3000,
        };
        const result = validateExpenses(profile);
        expect(result.isValid).toBe(true);
        expect(result.minimumExpected).toBe(3500);
    });

    it('fails when declared expenses are below the single-person NCR minimum', () => {
        const profile: FinancialProfile = {
            grossIncome: 30000,
            netIncome: 22000,
            declaredExpenses: 2000, // below R3500
            householdSize: 1,
            existingDebtInstallments: 3000,
        };
        const result = validateExpenses(profile);
        expect(result.isValid).toBe(false);
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('reckless lending');
    });

    it('uses couple threshold (R5500) for household size 2', () => {
        const profile: FinancialProfile = {
            grossIncome: 40000,
            netIncome: 30000,
            declaredExpenses: 5000, // below R5500
            householdSize: 2,
            existingDebtInstallments: 5000,
        };
        const result = validateExpenses(profile);
        expect(result.isValid).toBe(false);
        expect(result.minimumExpected).toBe(5500);
    });

    it('uses family-one-child threshold (R7500) for household size 3', () => {
        const result = validateExpenses({
            grossIncome: 50000,
            netIncome: 38000,
            declaredExpenses: 8000,
            householdSize: 3,
            existingDebtInstallments: 6000,
        });
        expect(result.isValid).toBe(true);
        expect(result.minimumExpected).toBe(7500);
    });

    it('uses family-two-children threshold (R9500) for household size 4+', () => {
        const result = validateExpenses({
            grossIncome: 60000,
            netIncome: 45000,
            declaredExpenses: 12000,
            householdSize: 5,
            existingDebtInstallments: 8000,
        });
        expect(result.isValid).toBe(true);
        expect(result.minimumExpected).toBe(9500);
    });
});

// ─── checkRecklessLending ─────────────────────────────────────────────────────

const singleProfile: FinancialProfile = {
    grossIncome: 30000,
    netIncome: 20000,
    declaredExpenses: 4000,
    householdSize: 1,
    existingDebtInstallments: 5000,
};

const makeLoan = (installment: number, repoRate = 8.25): LoanApplication => ({
    amount: 50000,
    installment,
    interestRate: 25,
    agreementDate: new Date('2024-01-01'),
    repoRateAtInception: repoRate,
});

describe('checkRecklessLending', () => {
    it('is NOT reckless when client has sufficient disposable income', () => {
        // netIncome 20000 - max(4000, 3500) - 5000 existing = 11000 disposable
        const result = checkRecklessLending(singleProfile, makeLoan(5000));
        expect(result.isReckless).toBe(false);
        expect(result.shortfall).toBe(0);
        expect(result.disposableIncome).toBeGreaterThan(0);
    });

    it('is reckless when installment exceeds disposable income', () => {
        // disposable = 20000 - 4000 - 5000 = 11000, loan installment = 15000
        const result = checkRecklessLending(singleProfile, makeLoan(15000));
        expect(result.isReckless).toBe(true);
        expect(result.shortfall).toBeGreaterThan(0);
        expect(result.reason).toContain('disposable income');
    });

    it('uses the higher of declared vs NCR minimum expenses', () => {
        const profileWithLowExpenses: FinancialProfile = {
            ...singleProfile,
            declaredExpenses: 1000, // below NCR minimum R3500
        };
        // Should use R3500 minimum: disposable = 20000 - 3500 - 5000 = 11500
        const affordable = checkRecklessLending(profileWithLowExpenses, makeLoan(5000));
        expect(affordable.isReckless).toBe(false);

        const reckless = checkRecklessLending(profileWithLowExpenses, makeLoan(14000));
        expect(reckless.isReckless).toBe(true);
    });
});

// ─── isInterestRateCompliant ──────────────────────────────────────────────────

describe('isInterestRateCompliant', () => {
    it('complies when interest rate is at exactly the maximum (repo + 21%)', () => {
        const loan: LoanApplication = {
            amount: 50000,
            installment: 1500,
            interestRate: 29.25, // 8.25 + 21 = 29.25
            agreementDate: new Date('2024-01-01'),
            repoRateAtInception: 8.25,
        };
        const result = isInterestRateCompliant(loan);
        expect(result.isCompliant).toBe(true);
        expect(result.maxRate).toBe(29.25);
    });

    it('does not comply when interest rate exceeds the maximum', () => {
        const loan: LoanApplication = {
            amount: 50000,
            installment: 2000,
            interestRate: 35, // above 29.25
            agreementDate: new Date('2024-01-01'),
            repoRateAtInception: 8.25,
        };
        const result = isInterestRateCompliant(loan);
        expect(result.isCompliant).toBe(false);
        expect(result.rate).toBe(35);
        expect(result.maxRate).toBe(29.25);
    });

    it('complies for a low interest rate', () => {
        const loan: LoanApplication = {
            amount: 20000,
            installment: 600,
            interestRate: 12,
            agreementDate: new Date('2024-01-01'),
            repoRateAtInception: 7.0,
        };
        const result = isInterestRateCompliant(loan);
        expect(result.isCompliant).toBe(true);
    });

    it('calculates maxRate based on repoRateAtInception', () => {
        const loan: LoanApplication = {
            amount: 30000,
            installment: 1000,
            interestRate: 26,
            agreementDate: new Date('2024-01-01'),
            repoRateAtInception: 5.0, // max = 5 + 21 = 26
        };
        const result = isInterestRateCompliant(loan);
        expect(result.isCompliant).toBe(true);
        expect(result.maxRate).toBe(26);
    });
});
