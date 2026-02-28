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
