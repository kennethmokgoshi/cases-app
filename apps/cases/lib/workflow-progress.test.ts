import { describe, it, expect } from 'vitest';
import { getWorkflowInfo } from './workflow-progress';

describe('getWorkflowInfo', () => {
    it('maps a BEGINNING status to stage 1 with a friendly label', () => {
        const info = getWorkflowInfo('NEW_LEAD');
        expect(info.label).toBe('New Lead');
        expect(info.stageNumber).toBe(1);
        expect(info.categoryName).toBe('Beginning stage');
        expect(info.percent).toBe(10);
        expect(info.isLost).toBe(false);
        expect(info.isOverdue).toBe(false);
        expect(info.description).toBeTruthy();
    });

    it('marks OVERDUE as the overdue state with a red bar', () => {
        const info = getWorkflowInfo('OVERDUE');
        expect(info.isOverdue).toBe(true);
        expect(info.stageNumber).toBe(2);
        expect(info.barClass).toContain('red');
    });

    it('maps SETTLED-category statuses to 100%', () => {
        const info = getWorkflowInfo('SETTLED');
        expect(info.stageNumber).toBe(10);
        expect(info.percent).toBe(100);
    });

    it('flags LOST cases without workflow progress', () => {
        const info = getWorkflowInfo('CANCELLED');
        expect(info.isLost).toBe(true);
        expect(info.percent).toBe(0);
        expect(info.barClass).toContain('gray');
    });

    it('falls back to Title Case for unknown status codes', () => {
        const info = getWorkflowInfo('SOME_CUSTOM_THING');
        expect(info.label).toBe('Some Custom Thing');
        expect(info.stageNumber).toBeNull();
        expect(info.categoryName).toBeNull();
        expect(info.percent).toBe(0);
    });
});
