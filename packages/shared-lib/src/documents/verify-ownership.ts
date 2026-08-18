/**
 * Consumer-ownership verification for ingested documents.
 *
 * The email scanners match on the ID number in the EMAIL (subject/body). That is
 * not proof of ownership: a debt counsellor can email "invoice for Tshepo,
 * 9202204720082" and attach Thabo's invoice by mistake. Filing Thabo's document
 * onto Tshepo's case associates one consumer's personal data with another
 * consumer's file — a POPIA disclosure.
 *
 * This module reads the ATTACHMENT ITSELF and decides who it actually belongs to.
 *
 * Verdicts:
 *   VERIFIED   — the case client's ID number was found inside the file.
 *   MISMATCH   — a different consumer's ID (checksum-valid) was found and the
 *                case client's ID was absent. Hard evidence of a wrong file.
 *   UNVERIFIED — nothing conclusive could be read. Attached but badged, and
 *                excluded from automation.
 *
 * Design rules that keep this safe:
 *   1. Only a checksum-valid foreign ID can produce MISMATCH. A structural
 *      13-digit match (an account number, a reference) must never quarantine a
 *      legitimate invoice.
 *   2. Text normalisation ("800101 5009 087") is used ONLY to confirm the
 *      expected ID. It can rescue a match but can never source a mismatch, so a
 *      normalisation artefact cannot cause a false quarantine.
 *   3. Extraction failure yields UNVERIFIED, never MISMATCH. We fail toward
 *      "attach and flag", not toward blocking real work.
 *   4. A joint application containing both consumers' IDs is VERIFIED — the
 *      expected ID is checked first and wins.
 */

import { createLogger } from '../logger';
import { extractAllSaIdNumbers, isValidSaIdChecksum } from '../utils/extract-id-number';

const logger = createLogger('documents/verify-ownership');

export type OwnershipVerdict = 'VERIFIED' | 'MISMATCH' | 'UNVERIFIED';

/** Why the verdict was reached — drives the wording staff see in the review queue. */
export type OwnershipReason =
    | 'ID_MATCHED'
    | 'FOREIGN_ID_FOUND'
    | 'NO_ID_IN_FILE'
    | 'NAME_ONLY_MATCH'
    | 'NO_TEXT_EXTRACTED'
    | 'NO_EXPECTED_ID';

export interface OwnershipDecision {
    verdict: OwnershipVerdict;
    reason: OwnershipReason;
    /** The ID we concluded the document belongs to (expected one when VERIFIED). */
    extractedIdNumber: string | null;
    /** Every SA ID found in the file, deduped, in order of appearance. */
    allExtractedIds: string[];
    expectedIdNumber: string | null;
    /** Human-readable sentence for case comments and the review queue. */
    message: string;
}

/** Strip everything that is not a digit, so "800101 5009 087" -> "8001015009087". */
export function normaliseId(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '');
}

/**
 * Join digits split by a single space or dash so a spaced-out ID is still found.
 * Only ever used to CONFIRM the expected ID (see design rule 2).
 */
export function compactDigitRuns(text: string): string {
    return text.replace(/(\d)[\s\-.](?=\d)/g, '$1');
}

function nameAppearsIn(text: string, firstName?: string | null, lastName?: string | null): boolean {
    const first = (firstName ?? '').trim().toLowerCase();
    const last = (lastName ?? '').trim().toLowerCase();
    if (!first || !last) return false;
    const haystack = text.toLowerCase();
    // Require both parts, not the joined string — documents render names in
    // several orders ("Mokoena, Tshepo" / "TSHEPO MOKOENA").
    return haystack.includes(first) && haystack.includes(last);
}

/**
 * Pure ownership decision. No IO — this is the unit under test.
 */
export function decideOwnership({
    text,
    expectedIdNumber,
    expectedFirstName,
    expectedLastName,
}: {
    text: string;
    expectedIdNumber?: string | null;
    expectedFirstName?: string | null;
    expectedLastName?: string | null;
}): OwnershipDecision {
    const expected = normaliseId(expectedIdNumber);

    if (!text || !text.trim()) {
        return {
            verdict: 'UNVERIFIED',
            reason: 'NO_TEXT_EXTRACTED',
            extractedIdNumber: null,
            allExtractedIds: [],
            expectedIdNumber: expected || null,
            message: 'No readable text could be extracted from this file, so ownership could not be confirmed.',
        };
    }

    const rawIds = [...new Set(extractAllSaIdNumbers(text).map(normaliseId))].filter(Boolean);

    // Rule 2: the compacted variant is searched only for the expected ID.
    const compacted = compactDigitRuns(text);
    const expectedPresent =
        Boolean(expected) && (rawIds.includes(expected) || compacted.includes(expected));

    if (!expected) {
        return {
            verdict: 'UNVERIFIED',
            reason: 'NO_EXPECTED_ID',
            extractedIdNumber: rawIds[0] ?? null,
            allExtractedIds: rawIds,
            expectedIdNumber: null,
            message: 'The case has no ID number on file, so document ownership could not be verified.',
        };
    }

    if (expectedPresent) {
        return {
            verdict: 'VERIFIED',
            reason: 'ID_MATCHED',
            extractedIdNumber: expected,
            allExtractedIds: rawIds.length > 0 ? rawIds : [expected],
            expectedIdNumber: expected,
            message: `Verified: this document contains the case client's ID number (${expected}).`,
        };
    }

    // Rule 1: only a checksum-valid foreign ID is strong enough to quarantine.
    const foreignValidIds = rawIds.filter(id => id !== expected && isValidSaIdChecksum(id));

    if (foreignValidIds.length > 0) {
        const foreign = foreignValidIds[0]!;
        return {
            verdict: 'MISMATCH',
            reason: 'FOREIGN_ID_FOUND',
            extractedIdNumber: foreign,
            allExtractedIds: rawIds,
            expectedIdNumber: expected,
            message:
                `Blocked: this document contains ID number ${foreign}, but this case belongs to ` +
                `${expected}. It was not attached to the case.`,
        };
    }

    if (nameAppearsIn(text, expectedFirstName, expectedLastName)) {
        return {
            verdict: 'UNVERIFIED',
            reason: 'NAME_ONLY_MATCH',
            extractedIdNumber: null,
            allExtractedIds: rawIds,
            expectedIdNumber: expected,
            message:
                "The client's name appears in this document but their ID number does not, " +
                'so ownership is not confirmed. Please check it manually.',
        };
    }

    return {
        verdict: 'UNVERIFIED',
        reason: 'NO_ID_IN_FILE',
        extractedIdNumber: null,
        allExtractedIds: rawIds,
        expectedIdNumber: expected,
        message: 'No SA ID number could be read from this document, so ownership is not confirmed.',
    };
}

export interface ExtractedText {
    text: string;
    method: 'PDF_TEXT' | 'VISION_OCR' | 'NONE';
}

/** How many pages of a PDF to read. Invoices and PoPs are short. */
const MAX_PAGES = 5;
/** Below this many characters a PDF is treated as a scan and sent to OCR. */
const SCANNED_PDF_THRESHOLD = 40;

/**
 * Transcribe an image (or scanned page) with the vision model. The model ONLY
 * transcribes — every ownership decision stays in deterministic code above.
 */
async function ocrImages(base64Images: string[]): Promise<string> {
    if (base64Images.length === 0) return '';
    const { getAiClientForTask } = await import('../ai/provider-client');
    const { client, model } = await getAiClientForTask('document_identification');

    const content: Array<Record<string, unknown>> = [
        {
            type: 'text',
            text:
                'Transcribe ALL visible text from these page images exactly as it appears. ' +
                'Include every number in full, especially any 13-digit South African ID numbers. ' +
                'Do not summarise, interpret, redact or omit anything. Return plain text only.',
        },
    ];
    for (const img of base64Images) {
        content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}`, detail: 'high' } });
    }

    const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: content as never }],
        max_tokens: 2000,
    });
    return response.choices[0]?.message?.content ?? '';
}

/**
 * Pull readable text out of an attachment. Never throws — an extraction failure
 * returns empty text, which the decision function turns into UNVERIFIED.
 */
export async function extractTextForVerification(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
): Promise<ExtractedText> {
    const type = (mimeType || '').toLowerCase();
    const isPdf = type.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    const isImage = type.startsWith('image/');
    const base64 = buffer.toString('base64');

    if (isPdf) {
        const { extractTextFromPdf, convertPdfToImages } = await import('../pdf-image');
        let text = '';
        try {
            text = await extractTextFromPdf(base64, MAX_PAGES);
        } catch (err) {
            logger.warn({ err, fileName }, 'PDF text extraction failed — falling back to OCR');
        }

        if (text.trim().length >= SCANNED_PDF_THRESHOLD) {
            return { text, method: 'PDF_TEXT' };
        }

        // Scanned invoice with no text layer — OCR the pages instead.
        try {
            const images = await convertPdfToImages(base64, MAX_PAGES);
            const ocr = await ocrImages(images);
            if (ocr.trim()) return { text: ocr, method: 'VISION_OCR' };
        } catch (err) {
            logger.warn({ err, fileName }, 'PDF OCR fallback failed');
        }
        return { text, method: text.trim() ? 'PDF_TEXT' : 'NONE' };
    }

    if (isImage) {
        try {
            const ocr = await ocrImages([base64]);
            if (ocr.trim()) return { text: ocr, method: 'VISION_OCR' };
        } catch (err) {
            logger.warn({ err, fileName }, 'Image OCR failed');
        }
        return { text: '', method: 'NONE' };
    }

    return { text: '', method: 'NONE' };
}

export interface VerifyOwnershipResult extends OwnershipDecision {
    method: ExtractedText['method'];
    textLength: number;
}

/**
 * Full check: read the file, then decide who it belongs to.
 */
export async function verifyDocumentOwnership({
    buffer,
    mimeType,
    fileName,
    expectedIdNumber,
    expectedFirstName,
    expectedLastName,
}: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    expectedIdNumber?: string | null;
    expectedFirstName?: string | null;
    expectedLastName?: string | null;
}): Promise<VerifyOwnershipResult> {
    let extracted: ExtractedText = { text: '', method: 'NONE' };
    try {
        extracted = await extractTextForVerification(buffer, mimeType, fileName);
    } catch (err) {
        // Rule 3: never let an extraction crash become a MISMATCH.
        logger.error({ err, fileName }, 'Ownership text extraction threw — treating as unverified');
    }

    const decision = decideOwnership({
        text: extracted.text,
        expectedIdNumber,
        expectedFirstName,
        expectedLastName,
    });

    if (decision.verdict === 'MISMATCH') {
        logger.warn(
            { fileName, found: decision.extractedIdNumber, expected: decision.expectedIdNumber },
            'Document ownership MISMATCH — quarantining',
        );
    }

    return { ...decision, method: extracted.method, textLength: extracted.text.length };
}
