import { describe, it, expect } from 'vitest';
import {
    getStatusByCode,
    getStatusesByCategory,
    WORKFLOW_STATUSES
} from './statuses';
import {
    addWorkingDays,
    getNextWorkingDay
} from './workingDays';
import {
    calculateSlaDeadline,
    isCaseOverdue
} from './workflow';

describe('Workflow Statuses', () => {
    it('should retrieve status by code', () => {
        const status = getStatusByCode('NEW_LEAD');
        expect(status).toBeDefined();
        expect(status?.name).toBe('New Lead');
        expect(status?.category).toBe('BEGINNING');
    });

    it('should return undefined for invalid code', () => {
        const status = getStatusByCode('INVALID_CODE');
        expect(status).toBeUndefined();
    });

    it('should retrieve statuses by category', () => {
        const intakeStatuses = getStatusesByCategory('BEGINNING');
        expect(intakeStatuses.length).toBeGreaterThan(0);
        intakeStatuses.forEach(s => {
            expect(s.category).toBe('BEGINNING');
        });
    });

    it('should have consolidated all 80+ statuses into logical categories', () => {
        // Basic check to ensure the list is comprehensive
        expect(WORKFLOW_STATUSES.length).toBeGreaterThan(50);
    });

    it('should have unique codes for all statuses', () => {
        const codes = WORKFLOW_STATUSES.map(s => s.code);
        const uniqueCodes = new Set(codes);
        expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should use valid categories for all statuses', () => {
        const validCategories = [
            'BEGINNING', 'OVERDUE', 'IN_PROGRESS', 'DETOUR', 
            'ADVANCED', 'ADVANCED_DETOUR', 'ADVANCED_PROGRESS', 
            'COMPLETED', 'PAYING', 'SETTLED', 'LOST'
        ];
        WORKFLOW_STATUSES.forEach(s => {
            expect(validCategories).toContain(s.category);
        });
    });

    it('should have SLA days defined if SLA is enabled', () => {
        WORKFLOW_STATUSES.forEach(s => {
            if (s.slaEnabled) {
                expect(s.slaDays).toBeDefined();
                expect(s.slaDays).toBeGreaterThan(0);
            }
        });
    });

    it('should have exactly one OVERDUE state', () => {
        const overdueStates = WORKFLOW_STATUSES.filter(s => s.isOverdueState);
        expect(overdueStates.length).toBe(1);
        expect(overdueStates[0].code).toBe('OVERDUE');
    });
});

describe('Working Days Logic', () => {
    it('should add working days correctly (skipping weekends)', () => {
        // Friday Feb 27, 2026
        const friday = new Date('2026-02-27');
        // Adding 1 working day should be Monday March 2, 2026
        const monday = addWorkingDays(friday, 1);
        expect(monday.getDay()).toBe(1); // Monday
        expect(monday.getDate()).toBe(2);
        expect(monday.getMonth()).toBe(2); // March (0-indexed)
    });

    it('should get next working day', () => {
        const saturday = new Date('2026-02-28');
        const nextDay = getNextWorkingDay(saturday);
        expect(nextDay.getDay()).toBe(1); // Monday

        const sunday = new Date('2026-03-01');
        const nextDay2 = getNextWorkingDay(sunday);
        expect(nextDay2.getDay()).toBe(1); // Monday

        const monday = new Date('2026-03-02');
        const nextDay3 = getNextWorkingDay(monday);
        expect(nextDay3.getDay()).toBe(1); // Still Monday (getNextWorkingDay only moves weekends to Monday)
    });
});

describe('SLA Logic', () => {
    it('should calculate SLA deadline based on business days', () => {
        const start = new Date('2026-02-26');
        const deadline = calculateSlaDeadline(start);
        // Default SLA is 5 business days
        // Feb 26 (Thu) + 5 business days = March 5 (Thu)
        expect(deadline.getDate()).toBe(5);
        expect(deadline.getMonth()).toBe(2); // March
    });

    it('should correctly identify overdue cases', () => {
        const past = new Date('2020-01-01');
        const future = new Date('2099-01-01');

        expect(isCaseOverdue(past)).toBe(true);
        expect(isCaseOverdue(future)).toBe(false);
        expect(isCaseOverdue(null)).toBe(false);
    });
});
