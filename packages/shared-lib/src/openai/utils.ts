import { logger } from '../logger';

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
