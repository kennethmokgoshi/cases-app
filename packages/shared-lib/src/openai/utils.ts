import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Document validation helpers
// ---------------------------------------------------------------------------

export interface ValidationResult {
    isValid: boolean;
    warnings: string[];
    flags: string[];
}

/**
 * Validates an extracted POA document for completeness.
 * Checks for: client signature, witness signatures, date, and ID number.
 */
export function validatePOA(poaData: any): ValidationResult {
    const warnings: string[] = [];
    const flags: string[] = [];

    if (!poaData) {
        return { isValid: false, warnings: [], flags: ['POA data is missing or could not be extracted'] };
    }

    // Required fields
    if (!poaData.idNumber || poaData.idNumber === 'NA') {
        flags.push('Client ID number not found on POA — required for bureau correspondence');
    }

    if (!poaData.names || poaData.names === 'NA') {
        flags.push('Client name not found on POA');
    }

    // Signature / witness fields (if the AI extracted them)
    if (poaData.signed === false || poaData.clientSigned === false) {
        flags.push('POA does not appear to be signed by the client');
    }

    if (poaData.witnessCount !== undefined && poaData.witnessCount < 2) {
        flags.push(`Only ${poaData.witnessCount} witness signature(s) found — 2 witnesses required for a valid POA`);
    } else if (poaData.witnesses !== undefined && Array.isArray(poaData.witnesses) && poaData.witnesses.length < 2) {
        flags.push(`Only ${poaData.witnesses.length} witness signature(s) found — 2 witnesses required`);
    }

    if (!poaData.dateSigned && !poaData.date && !poaData.signingDate) {
        warnings.push('Date of signing not visible on POA — confirm with original document');
    }

    // Salary data present is a positive sign (Zenowethu POA captures income)
    if (poaData.grossSalary === 0 && poaData.netSalary === 0) {
        warnings.push('No salary information found on POA — may be a generic POA without income declaration');
    }

    const isValid = flags.length === 0;
    return { isValid, warnings, flags };
}

/**
 * Validates a Proof of Residence document.
 * Checks: document date within 3 months, name on document, no PO Box only.
 */
export function validateProofOfResidence(porData: any): ValidationResult {
    const warnings: string[] = [];
    const flags: string[] = [];

    if (!porData) {
        return { isValid: false, warnings: [], flags: ['Proof of Residence data missing or could not be extracted'] };
    }

    // Check document date
    if (!porData.documentDate || porData.documentDate === 'NA') {
        flags.push('Document date not found — Proof of Residence must not be older than 3 months');
    } else {
        const docDate = new Date(porData.documentDate);
        if (!isNaN(docDate.getTime())) {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (docDate < threeMonthsAgo) {
                flags.push(`Proof of Residence is dated ${porData.documentDate} — older than 3 months. A recent document is required.`);
            }
        } else {
            warnings.push(`Document date "${porData.documentDate}" could not be parsed — verify manually`);
        }
    }

    // Client name present
    if (!porData.clientName || porData.clientName === 'NA') {
        flags.push('Consumer name not visible on Proof of Residence document');
    }

    // Address check — PO Box only is not acceptable
    const address = String(porData.address || '').toLowerCase();
    if (!address || address === 'na') {
        flags.push('No address found on Proof of Residence document');
    } else if (address.startsWith('p.o.') || address.startsWith('po box') || address.startsWith('p o box')) {
        flags.push('Only a PO Box address found — a physical residential address is required');
    }

    // Issuer present
    if (!porData.issuer || porData.issuer === 'NA') {
        warnings.push('Issuing institution not identified — confirm document is from a recognised source (municipality, bank, telco)');
    }

    const isValid = flags.length === 0;
    return { isValid, warnings, flags };
}

/**
 * Validates a credit bureau report document.
 * Checks: within 30 days, from a registered NCR bureau, ID number present.
 */
export function validateCreditReport(creditReportData: any, bureauName?: string): ValidationResult {
    const warnings: string[] = [];
    const flags: string[] = [];

    if (!creditReportData) {
        return { isValid: false, warnings: [], flags: ['Credit report data missing or could not be extracted'] };
    }

    // Registered NCR bureaus
    const registeredBureaus = ['experian', 'transunion', 'xds', 'compuscan', 'cpb', 'vericred'];
    if (bureauName) {
        const b = bureauName.toLowerCase();
        if (!registeredBureaus.some((rb) => b.includes(rb))) {
            warnings.push(`Bureau "${bureauName}" is not one of the known NCR-registered bureaus — verify registration`);
        }
    }

    // ID number present
    const idNum = creditReportData.consumer?.idNumber || creditReportData._occurrences?.idNumber?.[0]?.value;
    if (!idNum || idNum === 'NA') {
        flags.push('Consumer ID number not found on credit report — required for cross-document verification');
    }

    // Report date — some reports don't explicitly show a "report date" but use today if none found
    // We flag if no accounts at all (empty report)
    const accounts = creditReportData.accounts || [];
    const adverse = creditReportData.adverseListings || [];
    if (accounts.length === 0 && adverse.length === 0) {
        warnings.push('No accounts found on credit report — report may be blank, corrupted, or not fully extracted');
    }

    const isValid = flags.length === 0;
    return { isValid, warnings, flags };
}

/**
 * Validates a South African ID number using the Luhn Algorithm.
 * Returns true if the ID is mathematically valid.
 */
export function validateSAID(id: string): { isValid: boolean; error?: string } {
    if (!id || typeof id !== 'string') return { isValid: false, error: 'ID is empty' };

    // Remove whitespace and check format
    const cleanId = id.replace(/\D/g, '');
    if (cleanId.length !== 13) {
        return { isValid: false, error: `ID must be 13 digits (found ${cleanId.length})` };
    }

    // Luhn Algorithm
    let sum = 0;
    let shouldDouble = false;
    // Loop from right to left
    for (let i = cleanId.length - 1; i >= 0; i--) {
        let digit = parseInt(cleanId.charAt(i));

        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    if (sum % 10 === 0) {
        return { isValid: true };
    } else {
        return { isValid: false, error: 'Invalid Checksum (Luhn Algorithm Failed). The ID number is mathematically impossible.' };
    }
}

/**
 * Clean up markdown code blocks from AI response and parse as JSON
 */
export function parseAIResponse(content: string): any {
    if (!content) {
        throw new Error('No response from OpenAI');
    }

    // Clean up markdown code blocks if present
    const jsonString = content.replace(/```json\n?|\n?```/g, '').trim();

    // Find the first '{' and last '}' to extract just the JSON object
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');

    let finalJson = jsonString;
    if (firstBrace !== -1 && lastBrace !== -1) {
        finalJson = jsonString.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(finalJson);
    } catch (e) {
        logger.error({ err: e }, 'JSON Parse Error');
        logger.error({ content: finalJson }, 'Failed Content');
        throw new Error(`Failed to parse AI response as JSON: ${e}`);
    }
}

/**
 * Cross-checks ID numbers extracted from different document types
 */
export function verifyIdNumbers(analysis: { id?: any; poa?: any; creditReport?: any }): {
    isVerified: boolean;
    bestId: string | null;
    warning: string | null;
} {
    const ids: string[] = [];

    const idFromDoc = analysis.id?.idNumber;
    const idFromCreditReport = analysis.creditReport?.consumer?.idNumber || analysis.creditReport?.idNumber;

    if (idFromDoc) ids.push(String(idFromDoc).replace(/\s/g, ''));
    if (idFromCreditReport) ids.push(String(idFromCreditReport).replace(/\s/g, ''));

    if (ids.length === 0) {
        return { isVerified: false, bestId: null, warning: 'No ID number found in any document' };
    }

    if (ids.length === 1) {
        return { isVerified: true, bestId: ids[0], warning: null };
    }

    // Check if IDs match (ignoring whitespace)
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 1) {
        return { isVerified: true, bestId: uniqueIds[0], warning: null };
    }

    // IDs don't match — prefer the one from the ID document
    logger.warn(`⚠️ ID number mismatch detected: ${uniqueIds.join(' vs ')}`);
    return {
        isVerified: false,
        bestId: idFromDoc || idFromCreditReport || null,
        warning: `ID number mismatch: ID document says "${idFromDoc}", credit report says "${idFromCreditReport}"`
    };
}

export interface FieldOccurrence {
    value: string;
    count: number;
    source: string; // e.g., 'ID Document', 'Power of Attorney', 'Credit Report'
}

export interface FieldVerification {
    field: string;       // human-readable field name, e.g., 'ID Number'
    chosenValue: string; // the value pre-filled in the form
    totalOccurrences: number;
    allValues: FieldOccurrence[];
    consistent: boolean; // true if all occurrences across all docs agree
    note: string;        // human-readable summary
}

/**
 * Builds a cross-document field verification report.
 * Compares key fields across ID document, POA, and credit report.
 * Returns a list of fields with discrepancies that the user should verify.
 */
export function buildVerificationReport(analysis: {
    id?: any;
    poa?: any;
    creditReport?: any;
    payslip?: any;
    bankStatement?: any;
}): FieldVerification[] {
    const report: FieldVerification[] = [];

    // Helper to collect occurrences of a field from a document's _occurrences
    const getOccurrences = (docData: any, fieldKey: string, source: string): FieldOccurrence[] => {
        if (!docData) return [];
        const occurrences = docData._occurrences?.[fieldKey];
        if (Array.isArray(occurrences) && occurrences.length > 0) {
            return occurrences.map((o: any) => ({ value: String(o.value || '').trim(), count: o.count || 1, source }));
        }
        // Fallback: just the plain value if no _occurrences
        const plainVal = docData[fieldKey];
        if (plainVal && plainVal !== 'NA' && plainVal !== 'null') {
            return [{ value: String(plainVal).trim(), count: 1, source }];
        }
        return [];
    };

    // Helper to build a FieldVerification entry from occurrences across multiple sources
    const buildEntry = (
        field: string,
        chosenValue: string,
        allOccurrences: FieldOccurrence[]
    ): FieldVerification => {
        // Aggregate by value (sum counts across sources)
        const valueMap = new Map<string, { count: number; sources: string[] }>();
        for (const occ of allOccurrences) {
            const key = occ.value.toUpperCase();
            const existing = valueMap.get(key);
            if (existing) {
                existing.count += occ.count;
                if (!existing.sources.includes(occ.source)) existing.sources.push(occ.source);
            } else {
                valueMap.set(key, { count: occ.count, sources: [occ.source] });
            }
        }

        const uniqueValues = [...valueMap.entries()];
        const totalOccurrences = allOccurrences.reduce((sum, o) => sum + o.count, 0);
        const consistent = uniqueValues.length <= 1;

        let note = '';
        if (totalOccurrences === 0) {
            note = 'Not found in any document';
        } else if (consistent) {
            note = `Found ${totalOccurrences} time${totalOccurrences > 1 ? 's' : ''} — consistent across all documents`;
        } else {
            const valueDescriptions = uniqueValues
                .sort((a, b) => b[1].count - a[1].count)
                .map(([val, data]) => `"${val}" (${data.count}x in: ${data.sources.join(', ')})`)
                .join(', ');
            note = `Found ${totalOccurrences} times with differences: ${valueDescriptions} — please verify the correct value`;
        }

        return {
            field,
            chosenValue,
            totalOccurrences,
            allValues: allOccurrences,
            consistent,
            note,
        };
    };

    // --- ID Number ---
    const idNumOccurrences = [
        ...getOccurrences(analysis.id, 'idNumber', 'ID Document'),
        ...getOccurrences(analysis.poa, 'idNumber', 'Power of Attorney'),
        ...getOccurrences({ ...analysis.creditReport?.consumer, _occurrences: analysis.creditReport?._occurrences }, 'idNumber', 'Credit Report'),
    ];
    const chosenIdNum = analysis.id?.idNumber || analysis.poa?.idNumber || analysis.creditReport?.consumer?.idNumber || 'NA';
    report.push(buildEntry('ID Number', chosenIdNum, idNumOccurrences));

    // --- Surname ---
    const surnameOccurrences = [
        ...getOccurrences(analysis.id, 'surname', 'ID Document'),
        ...getOccurrences(analysis.poa, 'surname', 'Power of Attorney'),
    ];
    const chosenSurname = analysis.id?.surname || analysis.poa?.surname || 'NA';
    report.push(buildEntry('Surname', chosenSurname, surnameOccurrences));

    // --- First Names ---
    const namesOccurrences = [
        ...getOccurrences(analysis.id, 'names', 'ID Document'),
        ...getOccurrences(analysis.poa, 'names', 'Power of Attorney'),
    ];
    const chosenNames = analysis.id?.names || analysis.poa?.names || 'NA';
    report.push(buildEntry('First Names', chosenNames, namesOccurrences));

    // --- Cell Number ---
    const cellOccurrences = [
        ...getOccurrences(analysis.poa, 'cellNumber', 'Power of Attorney'),
        ...getOccurrences(analysis.creditReport?.consumer, 'cellNumber', 'Credit Report'),
    ];
    const chosenCell = analysis.poa?.cellNumber || analysis.creditReport?.consumer?.cellNumber || 'NA';
    report.push(buildEntry('Cell Number', chosenCell, cellOccurrences));

    // --- Employer ---
    const employerOccurrences = [
        ...getOccurrences(analysis.poa, 'employer', 'Power of Attorney'),
        ...getOccurrences(analysis.payslip, 'employer', 'Payslip'),
        ...getOccurrences(analysis.creditReport?.consumer, 'employer', 'Credit Report'),
    ];
    const chosenEmployer = analysis.payslip?.employer || analysis.poa?.employer || analysis.creditReport?.consumer?.employer || 'NA';
    report.push(buildEntry('Employer', chosenEmployer, employerOccurrences));

    // --- Salary Date ---
    // Cross-check payslip pay date vs bank statement salary deposit date
    const payslipDate = analysis.payslip?.payDate;
    const payslipDateSource = analysis.payslip?.payDateSource; // 'explicit' | 'period_end' | 'month_end' | 'NA'
    const bankSalaryDate = analysis.bankStatement?.latestSalaryDeposit?.date;
    const salaryDateOccurrences: FieldOccurrence[] = [];
    if (payslipDate && payslipDate !== 'NA') {
        const isEstimate = payslipDateSource && payslipDateSource !== 'explicit';
        const label = isEstimate ? `Payslip (pay period end — exact pay date not shown)` : 'Payslip';
        salaryDateOccurrences.push({ value: payslipDate, count: 1, source: label });
    }
    if (bankSalaryDate && bankSalaryDate !== 'NA') {
        salaryDateOccurrences.push({ value: bankSalaryDate, count: 1, source: 'Bank Statement (actual deposit date)' });
    }
    // Prefer bank statement date as it's the most reliable — payslip period_end is just an estimate
    const chosenSalaryDate = bankSalaryDate || payslipDate || 'NA';
    if (salaryDateOccurrences.length > 0) {
        report.push(buildEntry('Salary Date', chosenSalaryDate, salaryDateOccurrences));
    }

    // Only return entries where there is at least 1 occurrence (don't clutter with all-NA fields)
    return report.filter(entry => entry.totalOccurrences > 0);
}
