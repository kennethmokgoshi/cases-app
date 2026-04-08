// ============================================================
// DCCP — TypeScript interfaces for all products and operations
// ============================================================

export type DCCPPolicyType = 'CLI' | 'AIP' | 'FUNERAL'
export type DCCPPolicyStatus = 'DRAFT' | 'SUBMITTED' | 'ACTIVE' | 'LAPSED' | 'CANCELLED'
export type DCCPFuneralCoverType = 'INDIVIDUAL' | 'FAMILY'
export type DCCPAccountType = 'CHEQUE' | 'SAVINGS'
export type DCCPFuneralDependantRelationship =
  | 'HUSBAND'
  | 'WIFE'
  | 'CHILD_14_21'
  | 'CHILD_7_13'
  | 'CHILD_0_6'
  | 'STILLBORN'

// ---------------------------------------------------------------
// Shared client & banking details
// ---------------------------------------------------------------

export interface DCCPClientDetails {
  firstName: string
  lastName: string
  idNumber: string
  dob: Date
  email?: string
  phone: string
  address: string
}

export interface DCCPBankingDetails {
  bankName: string
  accountNumber: string
  accountType: DCCPAccountType
  debitOrderDate: number // 1-31
}

export interface DCCPPreviousInsurance {
  previousInsurerName: string
  previousPolicyNumber: string
  /** Whether client can provide previous policy schedule for waiting period waiver */
  hasPreviousPolicySchedule: boolean
}

// ---------------------------------------------------------------
// Credit Life Insurance (CLI)
// ---------------------------------------------------------------

export interface DCCPCreditAccount {
  creditProvider: string
  accountNumber?: string
  accountType: string // e.g. "Personal Loan", "Credit Card", "Store Account"
  outstandingBalance: number
  currentPremium: number   // what client pays now
  newPremium: number       // DCCP replacement premium
  saving: number           // currentPremium - newPremium
}

export interface DCCPCliPolicyInput {
  policyType: 'CLI'
  client: DCCPClientDetails
  banking: DCCPBankingDetails
  creditAccounts: DCCPCreditAccount[]
  previousInsurance?: DCCPPreviousInsurance
  inceptionDate: Date
}

// ---------------------------------------------------------------
// Assistance Income Protector (AIP)
// ---------------------------------------------------------------

export type DCCPAipMonthlyBenefit = 5_000 | 10_000 | 15_000

export interface DCCPAipPolicyInput {
  policyType: 'AIP'
  client: DCCPClientDetails
  banking: DCCPBankingDetails
  monthlyBenefit: DCCPAipMonthlyBenefit
  employerName: string
  employedSince: Date
  previousInsurance?: DCCPPreviousInsurance
  inceptionDate: Date
}

// ---------------------------------------------------------------
// Funeral Cover
// ---------------------------------------------------------------

export type DCCPFuneralCoverAmount = 10_000 | 20_000 | 30_000

export interface DCCPFuneralDependant {
  relationship: DCCPFuneralDependantRelationship
  firstName: string
  lastName: string
  idNumber?: string
  dob?: Date
  coverAmount: number
}

export interface DCCPFuneralPolicyInput {
  policyType: 'FUNERAL'
  client: DCCPClientDetails
  banking: DCCPBankingDetails
  funeralCoverType: DCCPFuneralCoverType
  coverAmount: DCCPFuneralCoverAmount
  /** Required for FAMILY cover */
  dependants?: DCCPFuneralDependant[]
  beneficiaryName: string
  beneficiaryRelationship: string
  previousInsurance?: DCCPPreviousInsurance
  inceptionDate: Date
}

export type DCCPPolicyInput = DCCPCliPolicyInput | DCCPAipPolicyInput | DCCPFuneralPolicyInput

// ---------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------

export interface DCCPEligibilityInput {
  policyType: DCCPPolicyType
  dob: Date
  /** For AIP: must be PERMANENT */
  employmentType?: 'PERMANENT' | 'CONTRACT' | 'SELF_EMPLOYED' | 'DIRECTOR'
  /** For AIP: hours worked per week */
  hoursPerWeek?: number
  /** For CLI: list of credit account types to check */
  creditAccountTypes?: string[]
}

export interface DCCPEligibilityResult {
  eligible: boolean
  reasons: string[]
  warnings: string[]
}

// ---------------------------------------------------------------
// Commission
// ---------------------------------------------------------------

export interface DCCPCommissionCalculation {
  policyType: DCCPPolicyType
  retailPremium: number
  referralFee: number
  /** Annual fee (12 months) */
  annualFee: number
}

export interface DCCPMonthlyCommissionReport {
  month: string // "2026-04"
  totalPolicies: number
  cliPolicies: number
  aipPolicies: number
  funeralPolicies: number
  totalPremium: number
  totalFee: number
  isPaid: boolean
  paidAt?: Date
}

// ---------------------------------------------------------------
// Portal automation
// ---------------------------------------------------------------

export interface DCCPSubmissionResult {
  success: boolean
  policyNumber?: string
  errorMessage?: string
  rawResponse?: string
}

export interface DCCPPolicyStatusResult {
  policyNumber: string
  status: DCCPPolicyStatus
  inceptionDate?: Date
  lastPremiumDate?: Date
  errorMessage?: string
}
