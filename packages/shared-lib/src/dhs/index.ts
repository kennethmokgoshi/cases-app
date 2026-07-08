/**
 * DHS (NCR Debt Help System) — Public API
 *
 * Re-exports all public symbols. This index file replaces the old flat dhs.ts
 * and is resolved automatically by `export * from './dhs'` in src/index.ts.
 *
 * Modules:
 *   types.ts      — TypeScript interfaces & type aliases
 *   browser.ts    — Puppeteer singleton, closeBrowser, loginToDHS
 *   extraction.ts — extractConsumerInfo, getDeclineReason
 *   counsellor.ts — getDebtCounsellorInfo
 *   status.ts     — checkTransferStatus
 *   transfer.ts   — requestTransfer
 *   search.ts     — searchConsumer, scrapeDetailedConsumerInfo
 */

export * from './types';
export { closeBrowser } from './browser';
export { getDebtCounsellorInfo } from './counsellor';
export { checkTransferStatus } from './status';
export { requestTransfer } from './transfer';
export { searchConsumer, scrapeDetailedConsumerInfo } from './search';
export { lookupDCFromNCR, resolveDCEmail } from './ncr-lookup';
export type { NCRDCLookupResult, DCEmailResolution } from './ncr-lookup';
export { handleDHSDecline, classifyDeclineReason, extractEmailFromReason } from './decline-handler';
export type { DeclineCategory, DeclineHandlerResult } from './decline-handler';
export { handleDhsAccepted, isManageConsumersEligible, READY_TO_CONSENT_STATUS } from './accepted-handler';
export type { AcceptedHandlerResult } from './accepted-handler';
export { buildAcceptedViaDhsEmail, ACCEPTED_VIA_DHS_SUBJECT, buildCredoLoginSection } from './accepted-email';
export type { CredoLoginDetails } from './accepted-email';
export { buildConsentReminderEmail, CONSENT_REMINDER_SUBJECT } from './consent-reminder-email';
export {
    createDrrConsentRequest,
    buildConsentLink,
    getConsentBaseUrl,
    buildCredoConsentLink,
    getCredoBaseUrl,
    getDrrConsentByToken,
    getDrrConsentVerificationState,
    recordDrrConsent,
    onDebtReviewRemovalConsent,
    verifyDrrConsentIdentity,
    DRR_CONSENT_TEXT,
    DRR_CONSENT_VERIFY_ERROR,
    CONSENT_EXPIRY_DAYS,
    CONSENT_RECEIVED_STATUS,
} from './consent-service';
export type {
    ConsentVerificationState,
    CreateConsentResult,
    ConsentView,
    RecordConsentResult,
    VerifyConsentIdentityResult,
} from './consent-service';
export {
    runDrrDocumentReadiness,
    docTypeToKind,
    resolveDocumentFilePath,
    REQUIRED_DOC_KINDS,
    AWAITING_DRR_DOCS_STATUS,
} from './drr-readiness';
export type { DrrReadinessResult, RequiredDocKind } from './drr-readiness';
export { runManageConsumersClearance } from './clearance-automation';
export type { ClearanceRunResult } from './clearance-automation';
export {
    getConsumerStatusHistory,
    getConsumerSuspensionIndicator,
    unsuspendConsumerServices,
    evaluateConsumerClearance,
    parseStatusHistoryRows,
    parseDhsDate,
    daysSinceCalendar,
    classifyClearanceWorkflowStatus,
    isClearanceEligibleCode,
    isAcceptedViaDhsCode,
    normalizeStatusCode,
    classifySuspension,
    classifyButtonColor,
    CLEARANCE_ELIGIBLE_CODES,
    CLEARANCE_READY_WINDOW_DAYS,
    ACCEPTED_VIA_DHS_CODES,
} from './status-history';
export type {
    StatusHistoryEntry,
    ClearanceEvaluation,
    ClearanceEligibleCode,
    AcceptedViaDhsCode,
    ConsumerStatusHistoryResult,
    ConsumerSuspensionCheckResult,
    UnsuspendConsumerServicesResult,
    SuspensionIndicator,
    SuspensionRowSignals,
    SuspensionStatus,
} from './status-history';
