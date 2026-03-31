import { describe, it, expect } from 'vitest';
import { addWorkingDays, getNextWorkingDay } from './workingDays';

describe('addWorkingDays', () => {
    it('adds 1 day on a weekday (Mon→Tue)', () => {
        const mon = new Date('2026-03-23'); // Monday
        const result = addWorkingDays(mon, 1);
        expect(result.getDay()).toBe(2); // Tuesday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-24');
    });

    it('skips weekends (Fri + 1 = Mon)', () => {
        const fri = new Date('2026-03-27'); // Friday
        const result = addWorkingDays(fri, 1);
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('skips weekends (Thu + 2 = Mon)', () => {
        const thu = new Date('2026-03-26'); // Thursday
        const result = addWorkingDays(thu, 2);
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('handles multi-week spans (Mon + 5 = Mon)', () => {
        const mon = new Date('2026-03-23'); // Monday
        const result = addWorkingDays(mon, 5);
        // Mon + 5 working days = next Monday
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('handles 10 working days (2 full weeks)', () => {
        const mon = new Date('2026-03-23'); // Monday
        const result = addWorkingDays(mon, 10);
        // 10 working days = 2 calendar weeks later (April 6, Monday)
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-04-06');
    });

    it('handles starting on Saturday (skips to Mon, then counts)', () => {
        const sat = new Date('2026-03-28'); // Saturday
        const result = addWorkingDays(sat, 1);
        // Sat → next day is Sun (skipped) → Mon counts as day 1
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('handles starting on Sunday (skips to Mon, then counts)', () => {
        const sun = new Date('2026-03-29'); // Sunday
        const result = addWorkingDays(sun, 1);
        // Sun → Mon counts as day 1
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('handles 0 working days (returns same date)', () => {
        const wed = new Date('2026-03-25'); // Wednesday
        const result = addWorkingDays(wed, 0);
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-25');
    });

    it('crosses month boundary correctly', () => {
        const fri = new Date('2026-03-27'); // Friday Mar 27
        const result = addWorkingDays(fri, 3);
        // Fri → Mon (1) → Tue (2) → Wed (3) = Apr 1
        expect(result.toISOString().slice(0, 10)).toBe('2026-04-01');
    });

    it('crosses year boundary correctly', () => {
        const wed = new Date('2026-12-30'); // Wednesday Dec 30
        const result = addWorkingDays(wed, 3);
        // Wed → Thu Dec 31 (1) → Fri Jan 1 (2) 2027 → skip Sat/Sun → Mon Jan 4 (3)
        // Actually: Dec 30 Wed → Dec 31 Thu (1) → Jan 1 Fri (2) → skip Sat/Sun → Jan 5 Mon (3)
        expect(result.getFullYear()).toBe(2027);
        expect(result.getDay()).toBe(1); // Monday
    });

    it('does not mutate the original date', () => {
        const original = new Date('2026-03-23');
        const originalTime = original.getTime();
        addWorkingDays(original, 5);
        expect(original.getTime()).toBe(originalTime);
    });
});

describe('getNextWorkingDay', () => {
    it('returns same date for Monday', () => {
        const mon = new Date('2026-03-23'); // Monday
        const result = getNextWorkingDay(mon);
        expect(result.getDay()).toBe(1);
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-23');
    });

    it('returns same date for Tuesday', () => {
        const tue = new Date('2026-03-24'); // Tuesday
        const result = getNextWorkingDay(tue);
        expect(result.getDay()).toBe(2);
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-24');
    });

    it('returns same date for Wednesday', () => {
        const wed = new Date('2026-03-25');
        const result = getNextWorkingDay(wed);
        expect(result.getDay()).toBe(3);
    });

    it('returns same date for Thursday', () => {
        const thu = new Date('2026-03-26');
        const result = getNextWorkingDay(thu);
        expect(result.getDay()).toBe(4);
    });

    it('returns same date for Friday', () => {
        const fri = new Date('2026-03-27');
        const result = getNextWorkingDay(fri);
        expect(result.getDay()).toBe(5);
    });

    it('returns Monday for Saturday', () => {
        const sat = new Date('2026-03-28'); // Saturday
        const result = getNextWorkingDay(sat);
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('returns Monday for Sunday', () => {
        const sun = new Date('2026-03-29'); // Sunday
        const result = getNextWorkingDay(sun);
        expect(result.getDay()).toBe(1); // Monday
        expect(result.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('crosses month boundary (Saturday → Monday in new month)', () => {
        // May 30, 2026 is a Saturday
        const sat = new Date('2026-05-30');
        const result = getNextWorkingDay(sat);
        expect(result.getDay()).toBe(1); // Monday
        expect(result.getMonth()).toBe(5); // June (0-indexed)
        expect(result.getDate()).toBe(1);
    });

    it('does not mutate the original date', () => {
        const original = new Date('2026-03-28'); // Saturday
        const originalTime = original.getTime();
        getNextWorkingDay(original);
        expect(original.getTime()).toBe(originalTime);
    });
});
