import { describe, it, expect } from 'vitest';
import {
    NEXT_UPDATE_APPS,
    isValidNextUpdateApp,
    nextUpdateLabel,
    isNextUpdateOverdue,
    daysUntilNextUpdate,
} from './next-update';

describe('next-update app keys', () => {
    it('includes all six apps', () => {
        expect(NEXT_UPDATE_APPS).toEqual(['CASES', 'FINANCE', 'LEGAL', 'INSURANCE', 'CREDO', 'FORENSIC']);
    });

    it('validates known and rejects unknown apps', () => {
        expect(isValidNextUpdateApp('FINANCE')).toBe(true);
        expect(isValidNextUpdateApp('finance')).toBe(false);
        expect(isValidNextUpdateApp('PAYROLL')).toBe(false);
    });

    it('labels Finance as Next Payment Date and others as Next Update Date', () => {
        expect(nextUpdateLabel('FINANCE')).toBe('Next Payment Date');
        expect(nextUpdateLabel('LEGAL')).toBe('Next Update Date');
        expect(nextUpdateLabel('UNKNOWN')).toBe('Next Update Date');
    });
});

describe('isNextUpdateOverdue', () => {
    const now = new Date('2026-06-26T12:00:00Z');

    it('is false for null/undefined', () => {
        expect(isNextUpdateOverdue(null, now)).toBe(false);
        expect(isNextUpdateOverdue(undefined, now)).toBe(false);
    });

    it('is true for a past date and false for a future date', () => {
        expect(isNextUpdateOverdue('2026-06-25T12:00:00Z', now)).toBe(true);
        expect(isNextUpdateOverdue('2026-06-27T12:00:00Z', now)).toBe(false);
    });

    it('is false for an invalid date', () => {
        expect(isNextUpdateOverdue('not-a-date', now)).toBe(false);
    });
});

describe('daysUntilNextUpdate', () => {
    const now = new Date('2026-06-26T00:00:00Z');
    it('returns null when unset', () => {
        expect(daysUntilNextUpdate(null, now)).toBeNull();
    });
    it('returns positive for future and negative for past', () => {
        expect(daysUntilNextUpdate('2026-06-29T00:00:00Z', now)).toBe(3);
        expect(daysUntilNextUpdate('2026-06-24T00:00:00Z', now)).toBe(-2);
    });
});
