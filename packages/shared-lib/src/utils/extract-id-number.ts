/**
 * Extract a valid South African 13-digit ID number from any text string.
 * Used as a fallback when GHL inbound messages cannot be matched by phone/email.
 *
 * SA ID format: YYMMDDGSSSCAZ
 *   YYMMDD  — date of birth
 *   G       — gender digit (0–4 female, 5–9 male)
 *   SSS     — sequence number
 *   C       — citizenship (0 = SA, 1 = permanent resident)
 *   A       — formerly race digit (now always 8 or 9 in modern IDs)
 *   Z       — Luhn check digit
 */

const SA_ID_REGEX = /\b(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7})\b/g;

/**
 * Return the first valid SA 13-digit ID number found in the text, or null.
 */
export function extractSaIdNumber(text: string): string | null {
    if (!text) return null;
    const matches = text.match(SA_ID_REGEX);
    if (!matches) return null;

    for (const candidate of matches) {
        if (isValidLuhn(candidate)) return candidate;
    }
    // Return the first structural match even if Luhn fails (older/non-standard IDs)
    return matches[0] ?? null;
}

/**
 * Return ALL valid SA ID numbers found in the text.
 */
export function extractAllSaIdNumbers(text: string): string[] {
    if (!text) return [];
    const matches = text.match(SA_ID_REGEX);
    return matches ?? [];
}

/**
 * True when the 13-digit ID passes the SA ID Luhn check digit.
 *
 * Exported because ownership verification treats a Luhn-valid foreign ID as hard
 * evidence that a document belongs to someone else (and quarantines it), while a
 * merely structural match is not strong enough to block a file.
 */
export function isValidSaIdChecksum(id: string): boolean {
    return /^\d{13}$/.test(id) && isValidLuhn(id);
}

function isValidLuhn(id: string): boolean {
    let sum = 0;
    let alternate = false;
    for (let i = id.length - 1; i >= 0; i--) {
        let n = parseInt(id[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}
