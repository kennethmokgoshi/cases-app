import { describe, it, expect } from 'vitest';
import { extractSaIdNumber, extractAllSaIdNumbers } from './extract-id-number';

describe('extractSaIdNumber', () => {
    it('extracts ID from plain body text', () => {
        expect(extractSaIdNumber('My ID number is 8001015009087 please update my file'))
            .toBe('8001015009087');
    });

    it('extracts ID from subject line format', () => {
        expect(extractSaIdNumber('RE: Transfer Request – 9202204720082'))
            .toBe('9202204720082');
    });

    it('extracts ID when surrounded by colons or labels', () => {
        expect(extractSaIdNumber('ID Number: 7601015800084 — please process'))
            .toBe('7601015800084');
    });

    it('returns the first ID when multiple are present', () => {
        expect(extractSaIdNumber('Client 8001015009087 and spouse 9202204720082'))
            .toBe('8001015009087');
    });

    it('returns null for text with no 13-digit number', () => {
        expect(extractSaIdNumber('Please send documents to our office')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractSaIdNumber('')).toBeNull();
    });

    it('ignores sequences that are not valid date prefixes', () => {
        // 9913 is not a valid month — regex should not match
        expect(extractSaIdNumber('Reference: 9913155009087 — invalid date')).toBeNull();
    });

    it('handles text with line breaks and extra whitespace', () => {
        expect(extractSaIdNumber('Dear Sir,\n\nKindly process file for 8504085800080.\n\nRegards'))
            .toBe('8504085800080');
    });
});

describe('extractAllSaIdNumbers', () => {
    it('returns all found IDs', () => {
        const ids = extractAllSaIdNumbers('IDs: 8001015009087 and 9202204720082 in this message');
        expect(ids).toContain('8001015009087');
        expect(ids).toContain('9202204720082');
        expect(ids.length).toBe(2);
    });

    it('returns empty array when none found', () => {
        expect(extractAllSaIdNumbers('No ID numbers here')).toEqual([]);
    });
});
