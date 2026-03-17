import { describe, it, expect, vi } from 'vitest';

// Mock shared-lib logger to avoid next/server transitive import in vitest
vi.mock('@zenowethu/shared-lib', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { validateSAID } from './openai';

// Known valid SA ID numbers (real format, Luhn-valid)
const VALID_IDS = [
    '8001015009087', // 1980-01-01 — Luhn check digit: 7
    '9001015009086', // 1990-01-01 — Luhn check digit: 6
    '0001015009085', // 2000-01-01 — Luhn check digit: 5
];

// ─── validateSAID ─────────────────────────────────────────────────────────────

describe('validateSAID', () => {
    // Happy path — valid IDs
    VALID_IDS.forEach(id => {
        it(`accepts valid SA ID: ${id}`, () => {
            const result = validateSAID(id);
            expect(result.isValid).toBe(true);
            expect(result.error).toBe('');
        });
    });

    // Length checks
    it('rejects an ID shorter than 13 digits', () => {
        const result = validateSAID('800101500');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('13 digits');
    });

    it('rejects an ID longer than 13 digits', () => {
        const result = validateSAID('80010150090870');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('13 digits');
    });

    it('rejects an empty string', () => {
        const result = validateSAID('');
        expect(result.isValid).toBe(false);
    });

    // Date component validation
    it('rejects an ID with invalid month 00', () => {
        // 8000015009083: month=00 is invalid
        const result = validateSAID('8000015009083');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid date');
    });

    it('rejects an ID with invalid month 13', () => {
        const result = validateSAID('8013015009083');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid date');
    });

    it('rejects an ID with invalid day 00', () => {
        const result = validateSAID('8001005009083');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid date');
    });

    // Luhn checksum
    it('rejects an ID with an incorrect check digit', () => {
        // 8001015009087 is valid; change last digit to make it invalid
        const result = validateSAID('8001015009081');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('checksum');
    });

    // Non-numeric input (gets cleaned first)
    it('strips non-numeric characters before validation', () => {
        // 800101-5009-087 → 8001015009087 (valid)
        const result = validateSAID('800101-5009-087');
        expect(result.isValid).toBe(true);
    });

    it('returns isValid=false and a non-empty error on failure', () => {
        const result = validateSAID('0000000000000');
        expect(result.isValid).toBe(false);
        expect(result.error.length).toBeGreaterThan(0);
    });
});
