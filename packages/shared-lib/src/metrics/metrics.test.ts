import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getBusinessDaysBetween,
    getSLATier,
    formatDuration,
    getDisputeDeadlineStatus
} from './index';

describe('Metrics Utilities', () => {

    describe('getBusinessDaysBetween', () => {
        it('should return 0 for the same date', () => {
            const date = new Date('2026-02-27');
            expect(getBusinessDaysBetween(date, date)).toBe(0);
        });

        it('should return 1 for Friday to Monday', () => {
            const friday = new Date('2026-02-27');
            const monday = new Date('2026-03-02');
            // differenceInBusinessDays returns 1 (Sat/Sun are skipped)
            expect(getBusinessDaysBetween(friday, monday)).toBe(1);
        });

        it('should return 5 for a full week', () => {
            const monday1 = new Date('2026-02-23');
            const monday2 = new Date('2026-03-02');
            expect(getBusinessDaysBetween(monday1, monday2)).toBe(5);
        });

        it('should be absolute (not negative)', () => {
            const start = new Date('2026-03-02');
            const end = new Date('2026-02-27');
            expect(getBusinessDaysBetween(start, end)).toBe(1);
        });
    });

    describe('getSLATier', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            // Set current time to Wednesday Feb 25, 2026
            vi.setSystemTime(new Date('2026-02-25'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should return NORMAL if no deadline', () => {
            expect(getSLATier(null, 'OPEN')).toBe('NORMAL');
        });

        it('should return NORMAL for completed/closed/cancelled status regardless of deadline', () => {
            const pastDeadline = new Date('2026-01-01');
            expect(getSLATier(pastDeadline, 'COMPLETED')).toBe('NORMAL');
            expect(getSLATier(pastDeadline, 'CLOSED')).toBe('NORMAL');
            expect(getSLATier(pastDeadline, 'CANCELLED')).toBe('NORMAL');
        });

        it('should return CRITICAL if deadline is in the past', () => {
            const pastDeadline = new Date('2026-02-24');
            expect(getSLATier(pastDeadline, 'OPEN')).toBe('CRITICAL');
        });

        it('should return WARNING if deadline is within 2 business days', () => {
            // Feb 25 (Wed) + 2 business days = Feb 27 (Fri)
            const friday = new Date('2026-02-27');
            expect(getSLATier(friday, 'OPEN')).toBe('WARNING');
        });

        it('should return NORMAL if deadline is far in the future', () => {
            const nextWeek = new Date('2026-03-10');
            expect(getSLATier(nextWeek, 'OPEN')).toBe('NORMAL');
        });
    });

    describe('formatDuration', () => {
        it('should format same day', () => {
            expect(formatDuration(0.4)).toBe('Same day');
            expect(formatDuration(0)).toBe('Same day');
        });

        it('should format single day', () => {
            expect(formatDuration(1)).toBe('1 day');
        });

        it('should format multiple days', () => {
            expect(formatDuration(5.2)).toBe('5.2 days');
            expect(formatDuration(10)).toBe('10.0 days');
        });
    });

    describe('getDisputeDeadlineStatus', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            // Friday Feb 27, 2026
            vi.setSystemTime(new Date('2026-02-27'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should calculate status for a fresh dispute', () => {
            const today = new Date('2026-02-27');
            const status = getDisputeDeadlineStatus(today);
            expect(status.remainingDays).toBe(20);
            expect(status.percentComplete).toBe(0);
            expect(status.isUrgent).toBe(false);
        });

        it('should calculate status for a dispute halfway through', () => {
            // 10 business days before Feb 27 (Fri)
            // Feb 27 -> Feb 20 (Fri) is 5 days
            // Feb 20 -> Feb 13 (Fri) is 10 days
            const tenDaysAgo = new Date('2026-02-13');
            const status = getDisputeDeadlineStatus(tenDaysAgo);
            expect(status.remainingDays).toBe(10);
            expect(status.percentComplete).toBe(50);
            expect(status.isUrgent).toBe(false);
        });

        it('should mark as urgent when <= 5 days remain', () => {
            // 15 business days before Feb 27 (Fri)
            const fifteenDaysAgo = new Date('2026-02-06');
            const status = getDisputeDeadlineStatus(fifteenDaysAgo);
            expect(status.remainingDays).toBe(5);
            expect(status.isUrgent).toBe(true);
        });

        it('should cap at 0 days and 100%', () => {
            const ancient = new Date('2020-01-01');
            const status = getDisputeDeadlineStatus(ancient);
            expect(status.remainingDays).toBe(0);
            expect(status.percentComplete).toBe(100);
            expect(status.isUrgent).toBe(true);
        });
    });
});
