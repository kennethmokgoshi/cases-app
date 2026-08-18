/**
 * Guards the consumer's identity fields against being rewritten by document analysis.
 *
 * The re-analysis routes previously did:
 *     updateData.idNumber = idVerification.bestId
 * unconditionally. If a document belonging to a different consumer ever reached a
 * case, running "Analyze" would overwrite that case client's OWN ID number with a
 * stranger's — silently corrupting the consumer record the rest of the platform
 * (DHS matching, email scanning, bureau sync) keys off.
 *
 * Rule: document analysis may FILL an empty identity field, never REPLACE a value
 * that is already on record. Replacing an existing ID is a staff decision, not an
 * automated one.
 */

export interface IdentityFieldDecision {
    /** Whether the caller should write this field. */
    allowed: boolean;
    value: string | null;
    /** Machine-readable outcome, for logging and case comments. */
    reason:
        | 'NOTHING_PROPOSED'
        | 'FILLED_EMPTY'
        | 'UNCHANGED'
        | 'BLOCKED_WOULD_REPLACE'
        | 'BLOCKED_UNVERIFIED';
    /** Set when a proposed change was refused and a human should look at it. */
    warning: string | null;
}

function normaliseId(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '');
}

/**
 * Decide whether an analysed ID number may be written to the client record.
 */
export function resolveClientIdNumberUpdate({
    currentIdNumber,
    proposedIdNumber,
    isVerified,
}: {
    currentIdNumber?: string | null;
    proposedIdNumber?: string | null;
    isVerified?: boolean;
}): IdentityFieldDecision {
    const current = normaliseId(currentIdNumber);
    const proposed = normaliseId(proposedIdNumber);

    if (!proposed) {
        return { allowed: false, value: null, reason: 'NOTHING_PROPOSED', warning: null };
    }

    if (current && current === proposed) {
        return { allowed: false, value: null, reason: 'UNCHANGED', warning: null };
    }

    if (current && current !== proposed) {
        return {
            allowed: false,
            value: null,
            reason: 'BLOCKED_WOULD_REPLACE',
            warning:
                `Document analysis read ID ${proposed}, but this client is already on record as ` +
                `${current}. The client's ID number was left unchanged — check whether a document ` +
                `belonging to another consumer has been attached to this case.`,
        };
    }

    // No ID on record yet — only accept a cross-checked one.
    if (!isVerified) {
        return {
            allowed: false,
            value: null,
            reason: 'BLOCKED_UNVERIFIED',
            warning:
                `Document analysis read ID ${proposed}, but it could not be cross-checked against ` +
                `a second document. The client's ID number was not set automatically.`,
        };
    }

    return { allowed: true, value: proposed, reason: 'FILLED_EMPTY', warning: null };
}

/**
 * Same rule for the consumer's name: fill when empty, never silently replace.
 * A wrong document corrupts the name exactly as easily as the ID number.
 */
export function resolveClientNameUpdate({
    currentValue,
    proposedValue,
    isVerified,
}: {
    currentValue?: string | null;
    proposedValue?: string | null;
    isVerified?: boolean;
}): IdentityFieldDecision {
    const current = (currentValue ?? '').trim();
    const proposed = (proposedValue ?? '').trim();

    if (!proposed) {
        return { allowed: false, value: null, reason: 'NOTHING_PROPOSED', warning: null };
    }
    if (current && current.toLowerCase() === proposed.toLowerCase()) {
        return { allowed: false, value: null, reason: 'UNCHANGED', warning: null };
    }
    if (current) {
        return {
            allowed: false,
            value: null,
            reason: 'BLOCKED_WOULD_REPLACE',
            warning: `Document analysis read the name "${proposed}", but this client is on record as "${current}". The name was left unchanged.`,
        };
    }
    if (!isVerified) {
        return { allowed: false, value: null, reason: 'BLOCKED_UNVERIFIED', warning: null };
    }
    return { allowed: true, value: proposed, reason: 'FILLED_EMPTY', warning: null };
}
