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
export {
    getConsumerStatusHistory,
    evaluateConsumerClearance,
    parseStatusHistoryRows,
    parseDhsDate,
    daysSinceCalendar,
    classifyClearanceWorkflowStatus,
    isClearanceEligibleCode,
    isAcceptedViaDhsCode,
    normalizeStatusCode,
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
} from './status-history';
