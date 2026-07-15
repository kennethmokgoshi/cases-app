import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    debtCounsellor: {
        findUnique: vi.fn(),
    },
    dhsOutcomeEvent: {
        findFirst: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));

import { recordDhsOutcome } from './outcome-events';

beforeEach(() => {
    vi.clearAllMocks();
    mockDb.dhsOutcomeEvent.findFirst.mockResolvedValue(null);
    mockDb.dhsOutcomeEvent.create.mockResolvedValue({ id: 'evt1' });
});

describe('recordDhsOutcome', () => {
    it('records a decline event with message and category', async () => {
        const result = await recordDhsOutcome({
            debtCounsellordId: 'dc1',
            caseId: 'case1',
            outcome: 'DECLINED',
            message: 'Please send transfer documents to docs@dc.co.za',
            category: 'SEND_DOCS',
            extractedEmail: 'docs@dc.co.za',
        });

        expect(result.recorded).toBe(true);
        expect(result.eventId).toBe('evt1');
        expect(mockDb.dhsOutcomeEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                debtCounsellordId: 'dc1',
                caseId: 'case1',
                outcome: 'DECLINED',
                category: 'SEND_DOCS',
                extractedEmail: 'docs@dc.co.za',
            }),
        });
    });

    it('dedupes the same case + outcome + message (DHS re-checks)', async () => {
        mockDb.dhsOutcomeEvent.findFirst.mockResolvedValue({ id: 'existing' });

        const result = await recordDhsOutcome({
            debtCounsellordId: 'dc1',
            caseId: 'case1',
            outcome: 'DECLINED',
            message: 'Same message as before',
        });

        expect(result.recorded).toBe(false);
        expect(result.duplicate).toBe(true);
        expect(result.eventId).toBe('existing');
        expect(mockDb.dhsOutcomeEvent.create).not.toHaveBeenCalled();
    });

    it('records a NEW decline message on the same case as a fresh event', async () => {
        mockDb.dhsOutcomeEvent.findFirst.mockResolvedValue(null); // different message → no match

        const result = await recordDhsOutcome({
            debtCounsellordId: 'dc1',
            caseId: 'case1',
            outcome: 'DECLINED',
            message: 'A different decline reason this time',
        });

        expect(result.recorded).toBe(true);
        expect(mockDb.dhsOutcomeEvent.findFirst).toHaveBeenCalledWith({
            where: { caseId: 'case1', outcome: 'DECLINED', message: 'A different decline reason this time' },
            select: { id: true },
        });
    });

    it('resolves the DC by NCRDC number when no id is given', async () => {
        mockDb.debtCounsellor.findUnique.mockResolvedValue({ id: 'dc-resolved' });

        const result = await recordDhsOutcome({
            ncrdcNo: 'NCRDC1234',
            caseId: 'case1',
            outcome: 'ACCEPTED',
        });

        expect(result.recorded).toBe(true);
        expect(mockDb.debtCounsellor.findUnique).toHaveBeenCalledWith({
            where: { ncrdcNo: 'NCRDC1234' },
            select: { id: true },
        });
        expect(mockDb.dhsOutcomeEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ debtCounsellordId: 'dc-resolved', outcome: 'ACCEPTED' }),
        });
    });

    it('skips silently when no DC record can be resolved', async () => {
        mockDb.debtCounsellor.findUnique.mockResolvedValue(null);

        const result = await recordDhsOutcome({
            ncrdcNo: 'NCRDC0000',
            caseId: 'case1',
            outcome: 'DECLINED',
            message: 'whatever',
        });

        expect(result.recorded).toBe(false);
        expect(result.duplicate).toBe(false);
        expect(result.reason).toContain('No DebtCounsellor');
        expect(mockDb.dhsOutcomeEvent.create).not.toHaveBeenCalled();
    });

    it('never throws when the database fails', async () => {
        mockDb.dhsOutcomeEvent.create.mockRejectedValue(new Error('db down'));

        const result = await recordDhsOutcome({
            debtCounsellordId: 'dc1',
            caseId: 'case1',
            outcome: 'DECLINED',
            message: 'msg',
        });

        expect(result.recorded).toBe(false);
        expect(result.reason).toBe('db down');
    });
});
