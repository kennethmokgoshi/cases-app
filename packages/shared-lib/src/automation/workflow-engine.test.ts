import { describe, it, expect, vi, beforeEach } from 'vitest';
import { touchCaseAction } from './workflow-engine';
import { prisma } from '@zenowethu/database';
import { addWorkingDays } from '../statuses/workingDays';

// Mock prisma client
vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            update: vi.fn(),
        },
    },
}));

// Mock workingDays to isolate tests
vi.mock('../statuses/workingDays', () => ({
    addWorkingDays: vi.fn((date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }),
}));

// Mock statuses config
vi.mock('../statuses/statuses', () => ({
    getStatusByCode: vi.fn((code: string) => {
        if (code === 'NEW_LEAD') {
            return { code: 'NEW_LEAD', name: 'New Lead', category: 'BEGINNING', slaEnabled: true, slaDays: 2 };
        }
        if (code === 'NO_SLA_STATUS') {
            return { code: 'NO_SLA_STATUS', name: 'No SLA', category: 'BEGINNING', slaEnabled: false };
        }
        return null;
    }),
}));

describe('touchCaseAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calculates 7 working days for COMMENT action', async () => {
        const caseId = 'case-123';
        const userId = 'user-456';
        
        await touchCaseAction(caseId, 'COMMENT', { userId });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 7);
        expect(prisma.case.update).toHaveBeenCalledWith({
            where: { id: caseId },
            data: {
                updatedAt: expect.any(Date),
                nextUpdate: expect.any(Date),
                updatedById: userId,
            },
        });
    });

    it('calculates status-specific SLA days for STATUS_CHANGE action', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'STATUS_CHANGE', { status: 'NEW_LEAD' });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 2);
    });

    it('falls back to 7 days for STATUS_CHANGE if status has no SLA config', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'STATUS_CHANGE', { status: 'NO_SLA_STATUS' });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 7);
    });

    it('calculates 3 days for DOCUMENT_UPLOAD action', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'DOCUMENT_UPLOAD');

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 3);
    });

    it('honors customDays if explicitly provided in options', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'OTHER', { customDays: 10 });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 10);
    });
});
