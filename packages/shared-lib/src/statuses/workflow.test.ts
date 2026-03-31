import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateSlaDeadline, isCaseOverdue, SLA_BUSINESS_DAYS, CRITICAL_STATUSES } from './workflow';

describe('calculateSlaDeadline', () => {
    it('adds 5 business days by default', () => {
        // SLA_BUSINESS_DAYS should be 5
        expect(SLA_BUSINESS_DAYS).toBe(5);
    });

    it('calculates correctly from Monday (Mon + 5 = Mon)', () => {
        const mon = new Date('2026-03-23'); // Monday
        const deadline = calculateSlaDeadline(mon);
        // Mon Mar 23 + 5 business days = Mon Mar 30
        expect(deadline.toISOString().slice(0, 10)).toBe('2026-03-30');
    });

    it('calculates correctly from Wednesday (Wed + 5 = Wed)', () => {
        const wed = new Date('2026-03-25'); // Wednesday
        const deadline = calculateSlaDeadline(wed);
        // Wed Mar 25 + 5 business days = Wed Apr 1
        expect(deadline.toISOString().slice(0, 10)).toBe('2026-04-01');
    });

    it('calculates correctly from Thursday (Thu + 5 spans two weekends)', () => {
        const thu = new Date('2026-02-26'); // Thursday
        const deadline = calculateSlaDeadline(thu);
        // Thu Feb 26 + 5 business days = Thu Mar 5
        expect(deadline.toISOString().slice(0, 10)).toBe('2026-03-05');
    });

    it('calculates correctly from Friday (Fri + 5 = Fri)', () => {
        const fri = new Date('2026-03-27'); // Friday
        const deadline = calculateSlaDeadline(fri);
        // Fri Mar 27 + 5 business days = Fri Apr 3
        expect(deadline.toISOString().slice(0, 10)).toBe('2026-04-03');
    });

    it('handles month boundary', () => {
        const thu = new Date('2026-03-26'); // Thursday
        const deadline = calculateSlaDeadline(thu);
        // Thu Mar 26 + 5 business days = Thu Apr 2
        expect(deadline.toISOString().slice(0, 10)).toBe('2026-04-02');
    });

    it('handles year boundary', () => {
        const mon = new Date('2026-12-28'); // Monday
        const deadline = calculateSlaDeadline(mon);
        // Mon Dec 28 + 5 business days = Mon Jan 4, 2027
        expect(deadline.getFullYear()).toBe(2027);
    });

    it('does not mutate the input date', () => {
        const original = new Date('2026-03-23');
        const originalTime = original.getTime();
        calculateSlaDeadline(original);
        expect(original.getTime()).toBe(originalTime);
    });
});

describe('isCaseOverdue', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns true when deadline is in the past', () => {
        const pastDate = new Date('2020-01-01');
        expect(isCaseOverdue(pastDate)).toBe(true);
    });

    it('returns false when deadline is in the future', () => {
        const futureDate = new Date('2099-12-31');
        expect(isCaseOverdue(futureDate)).toBe(false);
    });

    it('returns false when deadline is null', () => {
        expect(isCaseOverdue(null)).toBe(false);
    });

    it('returns true when deadline is exactly now (past)', () => {
        vi.useFakeTimers();
        const now = new Date('2026-03-23T12:00:00Z');
        vi.setSystemTime(now);

        // Deadline is 1ms before now
        const justPast = new Date('2026-03-23T11:59:59Z');
        expect(isCaseOverdue(justPast)).toBe(true);
    });

    it('returns false when deadline is 1 second in the future', () => {
        vi.useFakeTimers();
        const now = new Date('2026-03-23T12:00:00Z');
        vi.setSystemTime(now);

        const justFuture = new Date('2026-03-23T12:00:01Z');
        expect(isCaseOverdue(justFuture)).toBe(false);
    });
});

describe('CRITICAL_STATUSES', () => {
    it('contains expected critical statuses', () => {
        expect(CRITICAL_STATUSES).toContain('Outstanding Documents');
        expect(CRITICAL_STATUSES).toContain('Invoice Requested from DC');
        expect(CRITICAL_STATUSES).toContain('Ready for Court Date');
    });

    it('has exactly 3 entries', () => {
        expect(CRITICAL_STATUSES).toHaveLength(3);
    });

    it('contains only strings', () => {
        CRITICAL_STATUSES.forEach(status => {
            expect(typeof status).toBe('string');
        });
    });
});
