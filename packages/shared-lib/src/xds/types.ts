/**
 * XDS (TransUnion XDS) Credit Bureau — Types
 */

export interface XdsCredentials {
    username: string;
    password: string;
    portalUrl: string; // e.g. https://portal.xds.co.za
}

export interface XdsCreditReportEntry {
    /** Consumer full name as shown on XDS search history */
    consumerName: string;
    /** South African ID number (13 digits) extracted from the report */
    idNumber: string | null;
    /** Date the credit check was performed */
    searchDate: string;
    /** Filename of the downloaded report PDF */
    fileName: string;
    /** Raw PDF buffer */
    pdfBuffer: Buffer;
    /** Reference / enquiry number from XDS */
    referenceNumber: string | null;
}

export interface XdsSyncResult {
    processed: number;
    newFilesCreated: number;
    existingFilesUpdated: number;
    errors: string[];
    details: XdsSyncDetail[];
}

export interface XdsSyncDetail {
    consumerName: string;
    idNumber: string | null;
    action: 'created' | 'uploaded' | 'skipped' | 'error';
    caseId: string | null;
    fileNumber: string | null;
    message: string;
}
