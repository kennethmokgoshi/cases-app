import { describe, it, expect } from 'vitest'
import {
  checkCliEligibility,
  checkAipEligibility,
  checkFuneralEligibility,
  checkDCCPEligibility,
} from './dccp-eligibility'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date for a person who is exactly `age` years old today */
function dobForAge(age: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - age)
  return d
}

const VALID_CLIENT_35 = dobForAge(35)
const TOO_YOUNG = dobForAge(16)
const TOO_OLD = dobForAge(70)

// ─── CLI ──────────────────────────────────────────────────────────────────────

describe('checkCliEligibility', () => {
  it('is eligible with valid age and eligible account types', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
      creditAccountTypes: ['Personal Loan', 'Credit Card'],
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('is ineligible when age is below 18', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: TOO_YOUNG,
      creditAccountTypes: ['Personal Loan'],
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Minimum entry age'))).toBe(true)
  })

  it('is ineligible when age is above 65', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: TOO_OLD,
      creditAccountTypes: ['Personal Loan'],
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Maximum entry age'))).toBe(true)
  })

  it('excludes MORTGAGE and returns a warning but stays eligible when other accounts exist', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
      creditAccountTypes: ['Personal Loan', 'MORTGAGE'],
    })
    expect(result.eligible).toBe(true)
    expect(result.warnings.some(w => w.includes('cannot be replaced'))).toBe(true)
  })

  it('is ineligible when ALL account types are excluded', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
      creditAccountTypes: ['MORTGAGE', 'VEHICLE_FINANCE'],
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('All provided credit accounts are excluded'))).toBe(true)
  })

  it('is ineligible when no credit accounts are provided', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('No credit accounts'))).toBe(true)
  })

  it('home_loan (case-insensitive) is also excluded', () => {
    const result = checkCliEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
      creditAccountTypes: ['Personal Loan', 'home loan'],
    })
    expect(result.eligible).toBe(true)
    expect(result.warnings.some(w => w.includes('cannot be replaced'))).toBe(true)
  })
})

// ─── AIP ──────────────────────────────────────────────────────────────────────

describe('checkAipEligibility', () => {
  it('is eligible for permanent employee aged 35 working 40hrs/week', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'PERMANENT',
      hoursPerWeek: 40,
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('is ineligible for self-employed', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'SELF_EMPLOYED',
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('SELF_EMPLOYED'))).toBe(true)
  })

  it('is ineligible for contractor', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'CONTRACT',
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('CONTRACT'))).toBe(true)
  })

  it('is ineligible for directors', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'DIRECTOR',
    })
    expect(result.eligible).toBe(false)
  })

  it('is ineligible when hours per week is below 20', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'PERMANENT',
      hoursPerWeek: 15,
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('15 hours'))).toBe(true)
  })

  it('is eligible at exactly 20 hours per week', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'PERMANENT',
      hoursPerWeek: 20,
    })
    expect(result.eligible).toBe(true)
  })

  it('issues a warning when client is 62 (close to cessation age of 70)', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: dobForAge(62),
      employmentType: 'PERMANENT',
    })
    expect(result.eligible).toBe(true)
    expect(result.warnings.some(w => w.includes('cessation'))).toBe(true)
  })

  it('is ineligible when employment type is missing', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons.some(r => r.includes('Employment type is required'))).toBe(true)
  })

  it('is ineligible when age is above 65', () => {
    const result = checkAipEligibility({
      policyType: 'AIP',
      dob: TOO_OLD,
      employmentType: 'PERMANENT',
    })
    expect(result.eligible).toBe(false)
  })
})

// ─── Funeral ──────────────────────────────────────────────────────────────────

describe('checkFuneralEligibility', () => {
  it('is eligible for client aged 35', () => {
    const result = checkFuneralEligibility({
      policyType: 'FUNERAL',
      dob: VALID_CLIENT_35,
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('always includes waiting period and address warnings', () => {
    const result = checkFuneralEligibility({
      policyType: 'FUNERAL',
      dob: VALID_CLIENT_35,
    })
    expect(result.warnings.some(w => w.includes('6 months'))).toBe(true)
    expect(result.warnings.some(w => w.includes('physical address'))).toBe(true)
  })

  it('is ineligible for under-18', () => {
    const result = checkFuneralEligibility({
      policyType: 'FUNERAL',
      dob: TOO_YOUNG,
    })
    expect(result.eligible).toBe(false)
  })

  it('is ineligible for over-65', () => {
    const result = checkFuneralEligibility({
      policyType: 'FUNERAL',
      dob: TOO_OLD,
    })
    expect(result.eligible).toBe(false)
  })
})

// ─── Dispatcher ───────────────────────────────────────────────────────────────

describe('checkDCCPEligibility', () => {
  it('routes CLI correctly', () => {
    const result = checkDCCPEligibility({
      policyType: 'CLI',
      dob: VALID_CLIENT_35,
      creditAccountTypes: ['Personal Loan'],
    })
    expect(result.eligible).toBe(true)
  })

  it('routes AIP correctly', () => {
    const result = checkDCCPEligibility({
      policyType: 'AIP',
      dob: VALID_CLIENT_35,
      employmentType: 'SELF_EMPLOYED',
    })
    expect(result.eligible).toBe(false)
  })

  it('routes FUNERAL correctly', () => {
    const result = checkDCCPEligibility({
      policyType: 'FUNERAL',
      dob: VALID_CLIENT_35,
    })
    expect(result.eligible).toBe(true)
  })
})
