
export type RescissionApplication = {
    caseId: string;
    clientName: string;
    debtCounsellorName: string;
    court: 'High Court' | 'Magistrates Court';
    documents: {
        form16: boolean;
        form17_1: boolean;
        form17_2: boolean;
        j1Certificate: boolean;
        balanceCertificate: boolean;
        restructuringAcceptance: boolean;
        confirmatoryAffidavit: boolean;
    };
    status: 'DRAFT' | 'READY_FOR_FILING' | 'FILED' | 'GRANTED';
};

/**
 * Validates if the application pack is complete according to the MS Ebrahim precedent.
 * All mandatory documents must be present.
 */
export function validateRescissionPack(app: RescissionApplication): { isValid: boolean; missingDocs: string[] } {
    const missingDocs: string[] = [];

    if (!app.documents.form16) missingDocs.push('Form 16');
    if (!app.documents.form17_1) missingDocs.push('Form 17.1');
    if (!app.documents.form17_2) missingDocs.push('Form 17.2');
    if (!app.documents.j1Certificate) missingDocs.push('J1 Debt Counsellor Certificate');
    if (!app.documents.balanceCertificate) missingDocs.push('Certificate of Balance');
    if (!app.documents.restructuringAcceptance) missingDocs.push('Debt Restructuring Acceptance');
    if (!app.documents.confirmatoryAffidavit) missingDocs.push('Consumer Confirmatory Affidavit');

    return {
        isValid: missingDocs.length === 0,
        missingDocs
    };
}

/**
 * Determines the correct court based on the debt amount or jurisdiction.
 * (Placeholder logic - can be expanded with specific jurisdiction rules)
 */
export function determineJurisdiction(totalDebt: number): 'High Court' | 'Magistrates Court' {
    // Generally, larger amounts go to High Court, but Debt Review often starts in Magistrate's.
    // This is a default rule.
    return 'Magistrates Court';
}
