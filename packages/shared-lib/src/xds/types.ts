/**
 * XDS (TransUnion XDS) Credit Bureau — Types
 */

export interface XdsCredentials {
    username: string;
    password: string;
    portalUrl: string;
}

export interface XdsCreditReportEntry {
    consumerName: string;
    idNumber: string | null;
    searchDate: string;
    fileName: string;
    pdfBuffer: Buffer;
    referenceNumber: string | null;
}

/** Raw metadata scraped from the XDS history table (no PDF yet) */
export interface XdsHistoryEntry {
    consumerName: string;
    searchDate: string;
    dateKey: string; // YYYY-MM-DD normalised
    referenceNumber: string | null;
    idNumber: string | null;
    viewLink: string | null;
}

export interface XdsSyncResult {
    processed: number;
    newFilesCreated: number;
    existingFilesUpdated: number;
    errors: string[];
    details: XdsSyncDetail[];
    /** YYYY-MM-DD dates that were fully processed in this run */
    datesProcessed: string[];
    /** The most recent YYYY-MM-DD date now stored as last synced */
    lastSyncedDate: string | null;
}

export interface XdsSyncDetail {
    consumerName: string;
    idNumber: string | null;
    action: 'created' | 'uploaded' | 'skipped' | 'error';
    caseId: string | null;
    fileNumber: string | null;
    message: string;
    date: string; // YYYY-MM-DD the report belongs to
}
