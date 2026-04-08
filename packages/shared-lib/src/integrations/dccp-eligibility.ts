import { DCCP_RULES, DCCP_CLI_EXCLUDED_ACCOUNT_TYPES } from './dccp-config'
import type { DCCPEligibilityInput, DCCPEligibilityResult } from './dccp-types'

// ============================================================
// DCCP Client Eligibility Checker
// Rules sourced from DCCP training manuals and policy documents
// ============================================================

/**
 * Calculate age in years from a date of birth.
 */
function getAge(dob: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age
}

// ---------------------------------------------------------------
// CLI Eligibility
// ---------------------------------------------------------------

/**
 * Check eligibility for Credit Life Insurance replacement.
 * - Client must be in debt review (assumed — caller's responsibility to verify)
 * - Mortgage and vehicle finance accounts are excluded per our business rules
 * - Age 18–65 at entry
 */
export function checkCliEligibility(input: DCCPEligibilityInput): DCCPEligibilityResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const age = getAge(input.dob)

  if (age < DCCP_RULES.MIN_AGE) {
    reasons.push(`Client is ${age} years old. Minimum entry age is ${DCCP_RULES.MIN_AGE}.`)
  }
  if (age > DCCP_RULES.MAX_ENTRY_AGE) {
    reasons.push(`Client is ${age} years old. Maximum entry age is ${DCCP_RULES.MAX_ENTRY_AGE}.`)
  }

  const excludedTypes = (input.creditAccountTypes ?? []).filter(type =>
    DCCP_CLI_EXCLUDED_ACCOUNT_TYPES.includes(
      type.toUpperCase().replace(/\s/g, '_') as (typeof DCCP_CLI_EXCLUDED_ACCOUNT_TYPES)[number],
    ),
  )

  if (excludedTypes.length > 0) {
    warnings.push(
      `The following account types cannot be replaced under DCCP CLI (per business rules): ${excludedTypes.join(', ')}. These accounts will be excluded from the policy.`,
    )
  }

  if (!input.creditAccountTypes || input.creditAccountTypes.length === 0) {
    reasons.push('No credit accounts provided. At least one credit account is required for CLI.')
  }

  const eligibleAccounts = (input.creditAccountTypes ?? []).filter(
    type =>
      !DCCP_CLI_EXCLUDED_ACCOUNT_TYPES.includes(
        type.toUpperCase().replace(/\s/g, '_') as (typeof DCCP_CLI_EXCLUDED_ACCOUNT_TYPES)[number],
      ),
  )

  if (input.creditAccountTypes && input.creditAccountTypes.length > 0 && eligibleAccounts.length === 0) {
    reasons.push('All provided credit accounts are excluded types (mortgage/vehicle). No eligible accounts remain for CLI.')
  }

  return { eligible: reasons.length === 0, reasons, warnings }
}

// ---------------------------------------------------------------
// AIP Eligibility
// ---------------------------------------------------------------

/**
 * Check eligibility for the Assistance Income Protector.
 * - Must be permanently employed (≥ 20 hrs/week, no fixed end date)
 * - Self-employed, directors, and contractors are excluded
 * - Age 18–65 at entry (cessation at 70)
 */
export function checkAipEligibility(input: DCCPEligibilityInput): DCCPEligibilityResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const age = getAge(input.dob)

  if (age < DCCP_RULES.MIN_AGE) {
    reasons.push(`Client is ${age} years old. Minimum entry age is ${DCCP_RULES.MIN_AGE}.`)
  }
  if (age > DCCP_RULES.MAX_ENTRY_AGE) {
    reasons.push(`Client is ${age} years old. Maximum entry age is ${DCCP_RULES.MAX_ENTRY_AGE}.`)
  }

  if (!input.employmentType) {
    reasons.push('Employment type is required for AIP.')
  } else if (['SELF_EMPLOYED', 'DIRECTOR', 'CONTRACT'].includes(input.employmentType)) {
    reasons.push(
      `Employment type "${input.employmentType}" is excluded from AIP cover. Only permanently employed individuals qualify.`,
    )
  } else if (input.employmentType !== 'PERMANENT') {
    reasons.push(`Employment type "${input.employmentType}" does not qualify. Must be PERMANENT.`)
  }

  if (input.hoursPerWeek !== undefined) {
    if (input.hoursPerWeek < DCCP_RULES.MIN_PERMANENT_EMPLOYMENT_HOURS_PER_WEEK) {
      reasons.push(
        `Client works ${input.hoursPerWeek} hours per week. Minimum is ${DCCP_RULES.MIN_PERMANENT_EMPLOYMENT_HOURS_PER_WEEK} hours per week for permanent employment.`,
      )
    }
  }

  if (age >= 60) {
    warnings.push(
      `Client is ${age} years old. Cover ceases at age ${DCCP_RULES.AIP_CESSATION_AGE}. Remaining cover period is approximately ${DCCP_RULES.AIP_CESSATION_AGE - age} years.`,
    )
  }

  return { eligible: reasons.length === 0, reasons, warnings }
}

// ---------------------------------------------------------------
// Funeral Eligibility
// ---------------------------------------------------------------

/**
 * Check eligibility for Funeral Cover.
 * - Age 18–65 at entry (no cessation age specified)
 * - No medical exam required
 * - Physical address required (checked at application, not here)
 */
export function checkFuneralEligibility(input: DCCPEligibilityInput): DCCPEligibilityResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const age = getAge(input.dob)

  if (age < DCCP_RULES.MIN_AGE) {
    reasons.push(`Client is ${age} years old. Minimum entry age is ${DCCP_RULES.MIN_AGE}.`)
  }
  if (age > DCCP_RULES.MAX_ENTRY_AGE) {
    reasons.push(`Client is ${age} years old. Maximum entry age is ${DCCP_RULES.MAX_ENTRY_AGE}.`)
  }

  warnings.push('Waiting period: 6 months for natural death, immediate for accidental death, 12 months for suicide.')
  warnings.push('A physical address is required to issue the policy.')

  return { eligible: reasons.length === 0, reasons, warnings }
}

// ---------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------

/**
 * Check client eligibility for a given DCCP product.
 */
export function checkDCCPEligibility(input: DCCPEligibilityInput): DCCPEligibilityResult {
  switch (input.policyType) {
    case 'CLI':
      return checkCliEligibility(input)
    case 'AIP':
      return checkAipEligibility(input)
    case 'FUNERAL':
      return checkFuneralEligibility(input)
    default: {
      const _exhaustive: never = input.policyType
      throw new Error(`Unknown policy type: ${_exhaustive}`)
    }
  }
}
