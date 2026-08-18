import { describe, it, expect } from 'vitest';
import { decideOwnership, normaliseId, compactDigitRuns } from './verify-ownership';

// Checksum-valid SA ID numbers (Luhn-valid) — required for a MISMATCH verdict.
const TSHEPO = '9202204720082';
const THABO = '8001015009087';

describe('normaliseId', () => {
    it('strips spaces, dashes and punctuation', () => {
        expect(normaliseId('800101 5009 087')).toBe(THABO);
        expect(normaliseId('800101-5009-087')).toBe(THABO);
    });

    it('handles null and undefined', () => {
        expect(normaliseId(null)).toBe('');
        expect(normaliseId(undefined)).toBe('');
    });
});

describe('compactDigitRuns', () => {
    it('joins digits split by single spaces or dashes', () => {
        expect(compactDigitRuns('ID: 800101 5009 087')).toContain(THABO);
        expect(compactDigitRuns('ID: 800101-5009-087')).toContain(THABO);
    });

    it('leaves non-digit text alone', () => {
        expect(compactDigitRuns('Invoice for Thabo Mokoena')).toBe('Invoice for Thabo Mokoena');
    });
});

describe('decideOwnership', () => {
    describe('VERIFIED', () => {
        it("verifies when the case client's ID is in the file", () => {
            const result = decideOwnership({
                text: `TAX INVOICE\nConsumer: Tshepo Ndlovu\nID Number: ${TSHEPO}\nAmount: R850.00`,
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('VERIFIED');
            expect(result.reason).toBe('ID_MATCHED');
            expect(result.extractedIdNumber).toBe(TSHEPO);
        });

        it('verifies when the ID is spaced out in the document', () => {
            const result = decideOwnership({
                text: 'ID Number: 920220 4720 082',
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('VERIFIED');
        });

        it('verifies a joint application containing both consumers', () => {
            // The expected ID is checked first, so a second person on the same
            // document must not trigger a mismatch.
            const result = decideOwnership({
                text: `Applicant: ${TSHEPO}\nSpouse: ${THABO}`,
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('VERIFIED');
        });

        it('ignores formatting differences in the expected ID', () => {
            const result = decideOwnership({
                text: `ID: ${TSHEPO}`,
                expectedIdNumber: '920220 4720 082',
            });
            expect(result.verdict).toBe('VERIFIED');
        });
    });

    describe('MISMATCH', () => {
        it("blocks a file carrying a different consumer's ID", () => {
            const result = decideOwnership({
                text: `TAX INVOICE\nConsumer: Thabo Mokoena\nID Number: ${THABO}\nAmount: R850.00`,
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('MISMATCH');
            expect(result.reason).toBe('FOREIGN_ID_FOUND');
            expect(result.extractedIdNumber).toBe(THABO);
            expect(result.expectedIdNumber).toBe(TSHEPO);
            expect(result.message).toContain(THABO);
        });

        it("blocks even when the expected consumer's NAME appears in the file", () => {
            // The exact attack the guard exists for: correct name on the covering
            // document, wrong person's ID in the body.
            const result = decideOwnership({
                text: `Re: Tshepo Ndlovu\nInvoice for ID ${THABO}`,
                expectedIdNumber: TSHEPO,
                expectedFirstName: 'Tshepo',
                expectedLastName: 'Ndlovu',
            });
            expect(result.verdict).toBe('MISMATCH');
        });

        it('reports every ID it found', () => {
            const result = decideOwnership({
                text: `${THABO} and 8504085800080`,
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('MISMATCH');
            expect(result.allExtractedIds).toContain(THABO);
            expect(result.allExtractedIds).toContain('8504085800080');
        });
    });

    describe('UNVERIFIED', () => {
        it('does not block on a 13-digit number that fails the ID checksum', () => {
            // An account or reference number must never quarantine a real invoice.
            const result = decideOwnership({
                text: 'Account number: 8001015009081\nPlease pay on time.',
                expectedIdNumber: TSHEPO,
            });
            expect(result.verdict).toBe('UNVERIFIED');
            expect(result.reason).toBe('NO_ID_IN_FILE');
        });

        it('returns UNVERIFIED when no text could be extracted', () => {
            const result = decideOwnership({ text: '', expectedIdNumber: TSHEPO });
            expect(result.verdict).toBe('UNVERIFIED');
            expect(result.reason).toBe('NO_TEXT_EXTRACTED');
        });

        it('flags a name-only match rather than trusting it', () => {
            const result = decideOwnership({
                text: 'Invoice for Tshepo Ndlovu. Amount due R850.',
                expectedIdNumber: TSHEPO,
                expectedFirstName: 'Tshepo',
                expectedLastName: 'Ndlovu',
            });
            expect(result.verdict).toBe('UNVERIFIED');
            expect(result.reason).toBe('NAME_ONLY_MATCH');
        });

        it('matches names written in either order', () => {
            const result = decideOwnership({
                text: 'NDLOVU, TSHEPO — statement of account',
                expectedIdNumber: TSHEPO,
                expectedFirstName: 'Tshepo',
                expectedLastName: 'Ndlovu',
            });
            expect(result.reason).toBe('NAME_ONLY_MATCH');
        });

        it('returns UNVERIFIED when the case has no ID on file', () => {
            const result = decideOwnership({
                text: `ID Number: ${THABO}`,
                expectedIdNumber: null,
            });
            expect(result.verdict).toBe('UNVERIFIED');
            expect(result.reason).toBe('NO_EXPECTED_ID');
        });
    });
});
