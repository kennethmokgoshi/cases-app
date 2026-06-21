import { describe, it, expect } from 'vitest';
import { maxZdmSequence, buildZdmFileNumber } from './file-number';

describe('maxZdmSequence', () => {
    it('returns 0 when there are no file numbers', () => {
        expect(maxZdmSequence([], 2026)).toBe(0);
    });

    it('finds the max for a simple sub-1000 set', () => {
        expect(maxZdmSequence(['ZDM-2026-001', 'ZDM-2026-217', 'ZDM-2026-099'], 2026)).toBe(217);
    });

    it('REGRESSION: ranks 1000 above 999 (numeric, not lexicographic)', () => {
        // The old text-sort returned "ZDM-2026-999" as the max once 1000 existed,
        // causing every later create to collide on fileNumber. This must be 1000.
        expect(maxZdmSequence(['ZDM-2026-998', 'ZDM-2026-999', 'ZDM-2026-1000'], 2026)).toBe(1000);
    });

    it('handles sequences well beyond 1000', () => {
        expect(maxZdmSequence(['ZDM-2026-1000', 'ZDM-2026-3536', 'ZDM-2026-1500'], 2026)).toBe(3536);
    });

    it('ignores file numbers from other years', () => {
        expect(maxZdmSequence(['ZDM-2025-9999', 'ZDM-2026-005'], 2026)).toBe(5);
    });

    it('ignores malformed file numbers', () => {
        expect(maxZdmSequence(['ZDM-2026-', 'garbage', 'ZDM-2026-abc', 'ZDM-2026-042'], 2026)).toBe(42);
    });
});

describe('buildZdmFileNumber', () => {
    it('zero-pads sub-1000 sequences to 3 digits', () => {
        expect(buildZdmFileNumber(2026, 7)).toBe('ZDM-2026-007');
        expect(buildZdmFileNumber(2026, 217)).toBe('ZDM-2026-217');
    });

    it('leaves 1000+ unpadded', () => {
        expect(buildZdmFileNumber(2026, 1000)).toBe('ZDM-2026-1000');
        expect(buildZdmFileNumber(2026, 3536)).toBe('ZDM-2026-3536');
    });

    it('round-trips with maxZdmSequence (next number never collides)', () => {
        const existing = ['ZDM-2026-999', 'ZDM-2026-1000'];
        const next = buildZdmFileNumber(2026, maxZdmSequence(existing, 2026) + 1);
        expect(next).toBe('ZDM-2026-1001');
        expect(existing).not.toContain(next);
    });
});
