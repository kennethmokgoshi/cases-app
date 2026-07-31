export interface ClearanceEligibilityInput {
    status?: string | null;
    dhsStatus?: string | null;
    manuallyAcceptedViaDhs?: boolean;
    documents?: Array<{ documentType?: string | null; type?: string | null }>;
    uploadedDocTypes?: string[];
    hasCreditReportOnRecord?: boolean;
}

const CLEARANCE_ELIGIBLE_STATUSES = new Set([
    'ACCEPTEDVIADHS',
    'ACCEPTEDFORM177',
    'READYTOCONSENT',
    'CONSENTRECEIVED',
    'AWAITINGDRRDOCS',
    'ZDMCLIENT',
    'ACCEPTED',
    'AUTOTRANSFERRED',
    'FORM177SENT',
]);

const CREDIT_REPORT_DOC_TYPES = new Set([
    'CREDITREPORT',
    'XDSREPORT',
    'XDSCREDITREPORT',
    'TRANSUNIONREPORT',
    'EXPERIANREPORT',
    'CREDITBUREAUREPORT',
    'COMPREHENSIVECREDITREPORT',
]);

function normalizeStatusStr(val: string | null | undefined): string {
    return (val ?? '').replace(/[\s_]+/g, '').toUpperCase();
}

/** Check if the case is in an eligible workflow / DHS status to evaluate clearance */
export function isClearanceButtonEligible(input: ClearanceEligibilityInput): boolean {
    if (input.manuallyAcceptedViaDhs) return true;
    
    const normStatus = normalizeStatusStr(input.status);
    const normDhsStatus = normalizeStatusStr(input.dhsStatus);

    return CLEARANCE_ELIGIBLE_STATUSES.has(normStatus) || CLEARANCE_ELIGIBLE_STATUSES.has(normDhsStatus);
}

/** Check if a credit report is present on the case */
export function hasCreditReport(input: ClearanceEligibilityInput): boolean {
    if (input.hasCreditReportOnRecord) return true;

    if (input.uploadedDocTypes && Array.isArray(input.uploadedDocTypes)) {
        for (const dt of input.uploadedDocTypes) {
            if (CREDIT_REPORT_DOC_TYPES.has(normalizeStatusStr(dt))) return true;
        }
    }

    if (input.documents && Array.isArray(input.documents)) {
        for (const doc of input.documents) {
            const dt = doc.documentType || doc.type;
            if (dt && CREDIT_REPORT_DOC_TYPES.has(normalizeStatusStr(dt))) return true;
        }
    }

    return false;
}
