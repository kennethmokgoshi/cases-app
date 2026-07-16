import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationLog: { findFirst: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { findPriorDocsEmail, decideDocsResend } from './decline-dedup';

const db = prisma as unknown as {
    notificationLog: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('findPriorDocsEmail', () => {
    const since = new Date('2026-07-01T00:00:00.000Z');

    it('reports found when a successful DC email exists after the decline', async () => {
        db.notificationLog.findFirst.mockResolvedValue({
            sentAt: new Date('2026-07-03T09:00:00.000Z'),
            recipient: 'dc@firm.co.za',
        });

        const result = await findPriorDocsEmail({ caseId: 'c1', dcEmail: 'dc@firm.co.za', since });

        expect(result.found).toBe(true);
        expect(result.recipient).toBe('dc@firm.co.za');
        // Query is scoped to a successful email for this recipient since the decline.
        const where = db.notificationLog.findFirst.mock.calls[0][0].where;
        expect(where).toMatchObject({ caseId: 'c1', channel: 'EMAIL', success: true, recipient: 'dc@firm.co.za' });
    });

    it('reports not found when nothing matches', async () => {
        db.notificationLog.findFirst.mockResolvedValue(null);
        const result = await findPriorDocsEmail({ caseId: 'c1', dcEmail: 'dc@firm.co.za', since });
        expect(result.found).toBe(false);
        expect(result.sentAt).toBeNull();
    });

    it('never throws — a DB error is treated as not-yet-sent', async () => {
        db.notificationLog.findFirst.mockRejectedValue(new Error('db down'));
        const result = await findPriorDocsEmail({ caseId: 'c1', dcEmail: null, since });
        expect(result.found).toBe(false);
    });

    it('omits the recipient filter when no DC email is known', async () => {
        db.notificationLog.findFirst.mockResolvedValue(null);
        await findPriorDocsEmail({ caseId: 'c1', dcEmail: null, since });
        const where = db.notificationLog.findFirst.mock.calls[0][0].where;
        expect(where.recipient).toBeUndefined();
    });
});

describe('decideDocsResend', () => {
    const now = new Date('2026-07-10T00:00:00.000Z');
    const future = new Date('2026-07-20T00:00:00.000Z');
    const past = new Date('2026-07-05T00:00:00.000Z');

    it('sends when nothing was sent before', () => {
        const d = decideDocsResend({ prior: { found: false, sentAt: null, recipient: null }, nextUpdate: future, now });
        expect(d.send).toBe(true);
        expect(d.skippedAsDuplicate).toBe(false);
    });

    it('skips when already sent and not overdue', () => {
        const d = decideDocsResend({
            prior: { found: true, sentAt: past, recipient: 'dc@firm.co.za' },
            nextUpdate: future,
            now,
        });
        expect(d.send).toBe(false);
        expect(d.skippedAsDuplicate).toBe(true);
        expect(d.overdue).toBe(false);
    });

    it('sends when already sent but overdue', () => {
        const d = decideDocsResend({
            prior: { found: true, sentAt: past, recipient: 'dc@firm.co.za' },
            nextUpdate: past,
            now,
        });
        expect(d.send).toBe(true);
        expect(d.overdue).toBe(true);
    });

    it('sends when forceResend overrides the guard', () => {
        const d = decideDocsResend({
            prior: { found: true, sentAt: past, recipient: 'dc@firm.co.za' },
            nextUpdate: future,
            forceResend: true,
            now,
        });
        expect(d.send).toBe(true);
        expect(d.skippedAsDuplicate).toBe(false);
    });

    it('treats a null next-update as not overdue', () => {
        const d = decideDocsResend({
            prior: { found: true, sentAt: past, recipient: null },
            nextUpdate: null,
            now,
        });
        expect(d.send).toBe(false);
        expect(d.overdue).toBe(false);
    });
});
