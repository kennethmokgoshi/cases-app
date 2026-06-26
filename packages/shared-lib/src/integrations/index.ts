export { getGHLCredentials, invalidateGHLCredentialsCache, isGhlEnabled } from './ghl-config'
export { GhlService } from './ghl-service'
export { GhlWorkflowService } from './ghl-workflow-service'
export { RetentionService } from './retention-service'
export { getDHSCredentials, invalidateDHSCredentialsCache } from './dhs-config'
export { getNCTCredentials, invalidateNCTCredentialsCache } from './nct-config'
export { getXDSCredentials, invalidateXDSCredentialsCache } from './xds-config'
export { getSMTPCredentials, invalidateSMTPCredentialsCache } from './smtp-config'
export type { SMTPCredentials } from './smtp-config'

// DCCP — DC Credit Protect integration
export { getDCCPCredentials, invalidateDCCPCredentialsCache, DCCP_CLI_COMMISSION_RATE, DCCP_AIP_TIERS, DCCP_INDIVIDUAL_FUNERAL_TIERS, DCCP_FAMILY_FUNERAL_TIERS, DCCP_FUNERAL_DEPENDANT_COVER, DCCP_RULES, DCCP_CLI_EXCLUDED_ACCOUNT_TYPES, DCCP_CONTACTS } from './dccp-config'
export type { DCCPCredentials } from './dccp-config'
export type { DCCPPolicyType, DCCPPolicyStatus, DCCPFuneralCoverType, DCCPAccountType, DCCPFuneralDependantRelationship, DCCPClientDetails, DCCPBankingDetails, DCCPPreviousInsurance, DCCPCreditAccount, DCCPCliPolicyInput, DCCPAipMonthlyBenefit, DCCPAipPolicyInput, DCCPFuneralCoverAmount, DCCPFuneralDependant, DCCPFuneralPolicyInput, DCCPPolicyInput, DCCPEligibilityInput, DCCPEligibilityResult, DCCPCommissionCalculation, DCCPMonthlyCommissionReport, DCCPSubmissionResult, DCCPPolicyStatusResult } from './dccp-types'
export { calculateCliCommission, calculateAipCommission, calculateFuneralCommission, calculatePortfolioCommission, calculateClientSaving, formatZAR } from './dccp-commission'
export type { DCCPPortfolioCommission } from './dccp-commission'
export { checkDCCPEligibility, checkCliEligibility, checkAipEligibility, checkFuneralEligibility } from './dccp-eligibility'
export { DCCPService, dccpService } from './dccp'
export { mapGhlSourceToLeadSource, LEAD_SOURCES } from './ghl-source-map'
export type { LeadSource } from './ghl-source-map'
// NOTE: telegram-bot is intentionally NOT re-exported here. It pulls in the OTP /
// AI / nodemailer chain, and this barrel is imported by notifications/service.ts —
// re-exporting it would create a circular import. Import it by deep path instead:
//   import { handleTelegramMessage } from '@zenowethu/shared-lib/src/integrations/telegram-bot'
