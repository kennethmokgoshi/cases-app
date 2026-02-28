/**
 * NCT (National Consumer Tribunal) — Type Definitions
 * Single source of truth for all NCT data contracts.
 */

export type NCTCaseStatus =
    | 'CAPTURED'
    | 'ASSESSED'
    | 'COMPLETE_NOTICE'
    | 'INCOMPLETE_NOTICE'
    | 'LAPSED'
    | 'FINALIZED'
    | 'WITHDRAWN'
    | 'DRAFT';

export interface NCTCaseInfo {
    caseNumber?: string;
    identityNo: string;
    consumerName: string;
    status: NCTCaseStatus;
    filingDate?: string;
    lastUpdated?: string;
}

export interface NCTEPurseInfo {
    balance: number;
    currency: string;
    lastChecked: string;
}

export interface NCTFilingResult {
    success: boolean;
    caseNumber?: string;
    message: string;
    missingDocuments?: string[];
}

export interface NCTPaymentHistoryEntry {
    date: string;
    description: string;
    amount: number;
    balanceAfter: number;
}
