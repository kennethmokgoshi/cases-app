import {
  DCCP_CLI_COMMISSION_RATE,
  DCCP_AIP_TIERS,
  DCCP_INDIVIDUAL_FUNERAL_TIERS,
  DCCP_FAMILY_FUNERAL_TIERS,
} from './dccp-config'
import type {
  DCCPCommissionCalculation,
  DCCPAipMonthlyBenefit,
  DCCPFuneralCoverAmount,
  DCCPFuneralCoverType,
} from './dccp-types'

// ============================================================
// CLI Commission
// 40% of all premiums collected, per the Referral Agreement
// ============================================================

/**
 * Calculate commission for a Credit Life Insurance policy.
 * @param totalMonthlyPremium  Sum of all replacement premiums across credit accounts
 */
export function calculateCliCommission(totalMonthlyPremium: number): DCCPCommissionCalculation {
  const referralFee = round2(totalMonthlyPremium * DCCP_CLI_COMMISSION_RATE)
  return {
    policyType: 'CLI',
    retailPremium: round2(totalMonthlyPremium),
    referralFee,
    annualFee: round2(referralFee * 12),
  }
}

// ============================================================
// AIP Commission
// Fixed fee per tier (from Annexure A of Referral Agreement)
// ============================================================

/**
 * Calculate commission for an Assistance Income Protector policy.
 * @param monthlyBenefit  5000 | 10000 | 15000
 */
export function calculateAipCommission(monthlyBenefit: DCCPAipMonthlyBenefit): DCCPCommissionCalculation {
  const tier = DCCP_AIP_TIERS.find(t => t.monthlyBenefit === monthlyBenefit)
  if (!tier) {
    throw new Error(`Invalid AIP monthly benefit: ${monthlyBenefit}. Must be 5000, 10000, or 15000.`)
  }
  return {
    policyType: 'AIP',
    retailPremium: tier.retailPremium,
    referralFee: tier.referralFee,
    annualFee: tier.referralFee * 12,
  }
}

// ============================================================
// Funeral Commission
// Fixed fee per tier and cover type (from Annexure A)
// ============================================================

/**
 * Calculate commission for a Funeral Cover policy.
 * @param coverType     'INDIVIDUAL' | 'FAMILY'
 * @param coverAmount   10000 | 20000 | 30000
 */
export function calculateFuneralCommission(
  coverType: DCCPFuneralCoverType,
  coverAmount: DCCPFuneralCoverAmount,
): DCCPCommissionCalculation {
  const tiers = coverType === 'INDIVIDUAL'
    ? DCCP_INDIVIDUAL_FUNERAL_TIERS
    : DCCP_FAMILY_FUNERAL_TIERS

  const tier = tiers.find(t => t.coverAmount === coverAmount)
  if (!tier) {
    throw new Error(
      `Invalid Funeral cover amount: ${coverAmount} for type ${coverType}. Must be 10000, 20000, or 30000.`,
    )
  }
  return {
    policyType: 'FUNERAL',
    retailPremium: tier.retailPremium,
    referralFee: tier.referralFee,
    annualFee: tier.referralFee * 12,
  }
}

// ============================================================
// Portfolio summary
// ============================================================

export interface DCCPPortfolioCommission {
  totalMonthlyPremium: number
  totalMonthlyFee: number
  totalAnnualFee: number
  breakdown: DCCPCommissionCalculation[]
}

/**
 * Aggregate commission across multiple policies in a portfolio.
 */
export function calculatePortfolioCommission(
  calculations: DCCPCommissionCalculation[],
): DCCPPortfolioCommission {
  const totalMonthlyPremium = round2(calculations.reduce((sum, c) => sum + c.retailPremium, 0))
  const totalMonthlyFee = round2(calculations.reduce((sum, c) => sum + c.referralFee, 0))
  const totalAnnualFee = round2(calculations.reduce((sum, c) => sum + c.annualFee, 0))
  return { totalMonthlyPremium, totalMonthlyFee, totalAnnualFee, breakdown: calculations }
}

/**
 * Calculate the savings a client achieves by switching to DCCP CLI.
 * @param currentTotalPremium  What the client pays now across all credit accounts
 * @param newTotalPremium      What the DCCP replacement premium totals
 */
export function calculateClientSaving(
  currentTotalPremium: number,
  newTotalPremium: number,
): { monthlySaving: number; annualSaving: number } {
  const monthlySaving = round2(currentTotalPremium - newTotalPremium)
  return { monthlySaving, annualSaving: round2(monthlySaving * 12) }
}

// ============================================================
// Helpers
// ============================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Format a ZAR amount for display: e.g. 1234.5 → "R 1 234.50"
 */
export function formatZAR(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
