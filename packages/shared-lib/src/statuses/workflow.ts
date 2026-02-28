import { addBusinessDays } from 'date-fns';

export const SLA_BUSINESS_DAYS = 5;

export function calculateSlaDeadline(startDate: Date): Date {
    return addBusinessDays(startDate, SLA_BUSINESS_DAYS);
}

export function isCaseOverdue(deadline: Date | null): boolean {
    if (!deadline) return false;
    return new Date() > deadline;
}

export const CRITICAL_STATUSES = [
    'Outstanding Documents',
    'Invoice Requested from DC',
    'Ready for Court Date'
];
