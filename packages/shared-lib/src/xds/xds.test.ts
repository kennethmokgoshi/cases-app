import { describe, it, expect } from 'vitest';
import { normaliseXdsDate, extractIdNumberFromFilename } from './scraper';

describe('XDS Helper Utilities', () => {
    describe('normaliseXdsDate', () => {
        it('normalises YYYY/MM/DD date format with timestamp', () => {
            expect(normaliseXdsDate('2026/04/24 15:12:29')).toBe('2026-04-24');
        });

        it('normalises YYYY-MM-DD date format', () => {
            expect(normaliseXdsDate('2026-04-24')).toBe('2026-04-24');
        });

        it('normalises DD/MM/YYYY date format', () => {
            expect(normaliseXdsDate('24/04/2026')).toBe('2026-04-24');
        });

        it('normalises DD-MM-YYYY date format', () => {
            expect(normaliseXdsDate('24-04-2026')).toBe('2026-04-24');
        });
    });

    describe('extractIdNumberFromFilename', () => {
        it('extracts 13-digit SA ID number from filename', () => {
            expect(extractIdNumberFromFilename('xds-report-8908115668085-details.pdf')).toBe('8908115668085');
        });

        it('returns null if no 13-digit ID is present', () => {
            expect(extractIdNumberFromFilename('xds-report-john-doe.pdf')).toBeNull();
        });
    });
});
