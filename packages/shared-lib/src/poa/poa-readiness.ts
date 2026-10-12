/**
 * POA readiness — pure rules deciding whether a POA may be sent to a consumer.
 *
 * Kept free of Node/DB imports so both the API route and the client-side
 * SendPoaModal can share the exact same rules.
 */

export type PoaReadinessType = 'STANDARD' | 'WESBANK';

export interface PoaReadinessInput {
    type:       PoaReadinessType;
    /** Case.services — a JSON array string, a plain string, or null. */
    services?:  string | null;
    dcName?:    string | null;
    dcNcrdcNo?: string | null;
    dcPhone?:   string | null;
}

export interface PoaReadiness {
    isFlagRemoval:   boolean;
    /** Send must be refused until the DHS check has been run. */
    blocked:         boolean;
    blockReason?:    string;
    /** Section 4 fields that are still empty. */
    missingDcFields: string[];
    /** Non-blocking notes for staff. */
    warnings:        string[];
}

/** Parse Case.services into a list, tolerating JSON arrays and plain strings. */
export function parseServices(services?: string | null): string[] {
    if (!services) return [];
    try {
        const parsed: unknown = JSON.parse(services);
        if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
        if (typeof parsed === 'string') return [parsed];
    } catch {
        // not JSON — treat as a plain string below
    }
    return [services];
}

export function isFlagRemovalService(services?: string | null): boolean {
    return parseServices(services).some(s => s.toLowerCase().includes('flag removal'));
}

export function checkPoaReadiness(input: PoaReadinessInput): PoaReadiness {
    const isFlagRemoval = isFlagRemovalService(input.services);

    const missingDcFields: string[] = [];
    if (!input.dcName?.trim())    missingDcFields.push('Debt counsellor name');
    if (!input.dcNcrdcNo?.trim()) missingDcFields.push('NCRDC registration number');
    if (!input.dcPhone?.trim())   missingDcFields.push('Counsellor contact number');

    // The Wesbank POA has no Section 4, so none of this applies to it.
    if (input.type === 'WESBANK') {
        return { isFlagRemoval, blocked: false, missingDcFields: [], warnings: [] };
    }

    // Name + NCRDC are what the transfer request needs; the phone is a courtesy.
    const requiredMissing = missingDcFields.filter(f => f !== 'Counsellor contact number');

    if (isFlagRemoval && requiredMissing.length > 0) {
        return {
            isFlagRemoval,
            blocked: true,
            blockReason:
                'This is a Debt Review Flag Removal case. Run the DHS check first so the current debt '
                + 'counsellor details are captured, then send the POA (Section 4 must be filled in).',
            missingDcFields,
            warnings: [],
        };
    }

    const warnings: string[] = [];
    if (missingDcFields.length > 0) {
        warnings.push(
            `Section 4 will be left blank (missing: ${missingDcFields.join(', ')}). `
            + 'That is fine unless the consumer is transferring from another debt counsellor.',
        );
    }

    return { isFlagRemoval, blocked: false, missingDcFields, warnings };
}
