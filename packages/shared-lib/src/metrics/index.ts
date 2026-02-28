import { differenceInBusinessDays } from 'date-fns';

/**
 * Metrics utility for ZenoCasesSystem.
 * Handles calculation of SLA compliance, status durations, and performance tiers.
 */

export type SLATier = 'NORMAL' | 'WARNING' | 'CRITICAL';

/**
 * Calculates the number of business days (South African calendar) between two dates.
 */
export function getBusinessDaysBetween(start: Date, end: Date): number {
    return Math.abs(differenceInBusinessDays(end, start));
}

/**
 * Categorizes a case based on its deadline and current date.
 */
export function getSLATier(deadline: Date | null, status: string): SLATier {
    if (!deadline || ['COMPLETED', 'CLOSED', 'CANCELLED'].includes(status)) {
        return 'NORMAL';
    }

    const now = new Date();
    const daysUntilDeadline = differenceInBusinessDays(deadline, now);

    if (daysUntilDeadline < 0) return 'CRITICAL';
    if (daysUntilDeadline <= 2) return 'WARNING';
    return 'NORMAL';
}

/**
 * Formats a duration in days into a human-readable string.
 */
export function formatDuration(days: number): string {
    if (days < 1) return 'Same day';
    if (days === 1) return '1 day';
    return `${days.toFixed(1)} days`;
}

/**
 * Calculates remaining days and status for a 20-day dispute clock.
 */
export function getDisputeDeadlineStatus(startDate: Date, totalDays: number = 20): {
    remainingDays: number;
    percentComplete: number;
    isUrgent: boolean;
} {
    const now = new Date();
    const businessDaysPassed = getBusinessDaysBetween(startDate, now);
    const remainingDays = Math.max(0, totalDays - businessDaysPassed);
    const percentComplete = Math.min(100, (businessDaysPassed / totalDays) * 100);
    const isUrgent = remainingDays <= 5;

    return {
        remainingDays,
        percentComplete,
        isUrgent
    };
}

export * from './prescription';
