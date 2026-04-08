import { logger } from '../logger'

// ============================================================
// DCCP — DC Credit Protect portal configuration
// Production portal: https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/
// Demo portal:       https://demo.pontis.co.za/arsys
// ============================================================

export interface DCCPCredentials {
  username: string
  password: string
  portalUrl: string
}

let credentialsCache: DCCPCredentials | null = null
let lastFetchTime = 0
const CACHE_TTL = 60_000 // 1 minute

export async function getDCCPCredentials(): Promise<DCCPCredentials> {
  const now = Date.now()
  if (credentialsCache && now - lastFetchTime < CACHE_TTL) {
    return credentialsCache
  }

  try {
    const { prisma } = require('@zenowethu/database')
    const cred = await prisma.dCCPCredential.findFirst({ where: { isActive: true } })

    credentialsCache = {
      username: cred?.username ?? process.env.DCCP_USERNAME ?? '',
      password: cred?.password ?? process.env.DCCP_PASSWORD ?? '',
      portalUrl: process.env.DCCP_PORTAL_URL ?? 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/',
    }
    lastFetchTime = now
    logger.info('[DCCP Config] Credentials loaded')
    return credentialsCache
  } catch (error) {
    logger.error('[DCCP Config] Failed to fetch credentials from DB, falling back to env', error)
    return {
      username: process.env.DCCP_USERNAME ?? '',
      password: process.env.DCCP_PASSWORD ?? '',
      portalUrl: process.env.DCCP_PORTAL_URL ?? 'https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/',
    }
  }
}

export function invalidateDCCPCredentialsCache(): void {
  credentialsCache = null
  lastFetchTime = 0
  logger.info('[DCCP Config] Credentials cache invalidated')
}

// ============================================================
// PRODUCT CONSTANTS
// All premium and fee figures are sourced directly from the
// DC Credit Protect Referral Agreement (Annexure A, signed 2026)
// ============================================================

/** Credit Life Insurance — 40% of any premium collected */
export const DCCP_CLI_COMMISSION_RATE = 0.40

/** AIP cover tiers: [monthlyBenefit, maxTotal, retailPremium, referralFee] */
export const DCCP_AIP_TIERS = [
  { monthlyBenefit: 5_000,  maxTotal: 30_000, retailPremium: 75,  referralFee: 15 },
  { monthlyBenefit: 10_000, maxTotal: 60_000, retailPremium: 110, referralFee: 20 },
  { monthlyBenefit: 15_000, maxTotal: 90_000, retailPremium: 135, referralFee: 25 },
] as const

/** Individual Funeral cover tiers: [coverAmount, retailPremium, referralFee] */
export const DCCP_INDIVIDUAL_FUNERAL_TIERS = [
  { coverAmount: 10_000, retailPremium: 75,  referralFee: 17 },
  { coverAmount: 20_000, retailPremium: 105, referralFee: 20 },
  { coverAmount: 30_000, retailPremium: 125, referralFee: 22 },
] as const

/** Family Funeral cover tiers: [coverAmount, retailPremium, referralFee] */
export const DCCP_FAMILY_FUNERAL_TIERS = [
  { coverAmount: 10_000, retailPremium: 90,  referralFee: 19 },
  { coverAmount: 20_000, retailPremium: 130, referralFee: 22 },
  { coverAmount: 30_000, retailPremium: 195, referralFee: 33 },
] as const

/** Family funeral dependant cover amounts per category (R30k family tier) */
export const DCCP_FUNERAL_DEPENDANT_COVER = {
  HUSBAND:        { r10k: 10_000, r20k: 20_000, r30k: 30_000 },
  WIFE:           { r10k: 10_000, r20k: 20_000, r30k: 30_000 },
  CHILD_14_21:    { r10k: 10_000, r20k: 20_000, r30k: 30_000 },
  CHILD_7_13:     { r10k:  5_000, r20k: 10_000, r30k: 15_000 },
  CHILD_0_6:      { r10k:  2_500, r20k:  5_000, r30k:  7_500 },
  STILLBORN:      { r10k:  1_250, r20k:  2_500, r30k:  5_000 },
} as const

/** Policy rules */
export const DCCP_RULES = {
  MIN_AGE: 18,
  MAX_ENTRY_AGE: 65,
  AIP_CESSATION_AGE: 70,
  MIN_PERMANENT_EMPLOYMENT_HOURS_PER_WEEK: 20,
  /** AIP waiting period in months */
  AIP_WAITING_PERIOD_MONTHS: 3,
  /** Funeral natural death waiting period in months */
  FUNERAL_NATURAL_DEATH_WAITING_MONTHS: 6,
  /** Funeral suicide waiting period in months */
  FUNERAL_SUICIDE_WAITING_MONTHS: 12,
  /** Number of consecutive missed premiums before lapse */
  PREMIUMS_BEFORE_LAPSE: 2,
  /** Grace period in days */
  GRACE_PERIOD_DAYS: 15,
  /** Cooling-off period in calendar months */
  COOLING_OFF_MONTHS: 1,
  /** Commission first payment: 45 days after policy inception */
  COMMISSION_FIRST_PAYMENT_DAYS: 45,
  /** Monthly commission cut-off day */
  COMMISSION_CUTOFF_DAY: 5,
  /** Monthly commission payment deadline */
  COMMISSION_PAYMENT_BY_DAY: 15,
  /** Policy capturing cut-off for same-month inception */
  CAPTURING_CUTOFF_DAY: 24,
} as const

/** Credit types excluded from CLI replacement (per business rules) */
export const DCCP_CLI_EXCLUDED_ACCOUNT_TYPES = [
  'MORTGAGE',
  'HOME_LOAN',
  'VEHICLE_FINANCE',
  'CAR_FINANCE',
] as const

/** Contact details for DCCP staff */
export const DCCP_CONTACTS = {
  callCentre:    { name: 'Anja Burger',   phone: '082 824 6166', email: 'anja@dccp.co.za',    role: 'Call Centre Manager' },
  sales1:        { name: 'Ravelle Kok',   phone: '061 802 2837', email: 'ravelle@dccp.co.za', role: 'Sales & Relationship Manager' },
  finance:       { name: 'Cristi Smith',  phone: '012 881 0296', email: 'finance@dccp.co.za', role: 'Finance Manager' },
  sales2:        { name: 'Carel du Preez',phone: '083 225 5899', email: 'carel@dccp.co.za',   role: 'Sales & Relationship Manager' },
  training:      { name: 'Ilze du Preez', phone: '072 341 3752', email: 'ilze@dccp.co.za',    role: 'Services/Training Consultant' },
  admin:         { email: 'admin@dccp.co.za' },
  claims:        { email: 'claims@dccp.co.za' },
  general:       { phone: '012 881 0296', email: 'info@dccp.co.za' },
} as const
