import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    debtCounsellorEmail: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
    },
    debtCounsellorEmailHistory: {
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    debtCounsellor: {
        update: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));

import {
    promoteDcEmail,
    getBestDcEmail,
    recordDcEmailBounce,
    seedDcPriorityEmails,
    MAX_PRIORITY_EMAILS,
} from './email-priority';

const row = (over: Partial<{ id: string; email: string; priority: number; lastBouncedAt: Date | null }>) => ({
    id: 'row1',
    email: 'a@dc.co.za',
    priority: 1,
    source: 'DHS',
    lastBouncedAt: null,
    bounceReason: null,
    notes: null,
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    // Run the transaction callback against the same mock delegates
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<void>) => fn(mockDb));
    mockDb.debtCounsellorEmail.create.mockResolvedValue({});
    mockDb.debtCounsellorEmail.update.mockResolvedValue({});
    mockDb.debtCounsellorEmail.delete.mockResolvedValue({});
    mockDb.debtCounsellor.update.mockResolvedValue({});
    mockDb.debtCounsellorEmailHistory.findFirst.mockResolvedValue({ id: 'seen' });
});

describe('promoteDcEmail', () => {
    it('inserts a new email at priority 1 and shifts existing entries down', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'old1@dc.co.za', priority: 1 }),
            row({ id: 'e2', email: 'old2@dc.co.za', priority: 2 }),
        ]);

        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'New@DC.co.za',
            source: 'DECLINE_EXTRACTED',
        });

        expect(result.promoted).toBe(true);
        expect(result.droppedEmail).toBeNull();
        expect(mockDb.debtCounsellorEmail.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ email: 'new@dc.co.za', priority: 1 }),
        });
        // old1 → P2, old2 → P3
        expect(mockDb.debtCounsellorEmail.update).toHaveBeenCalledWith({
            where: { id: 'e1' },
            data: { priority: 2 },
        });
        expect(mockDb.debtCounsellorEmail.update).toHaveBeenCalledWith({
            where: { id: 'e2' },
            data: { priority: 3 },
        });
        // legacy preferredEmail kept in sync
        expect(mockDb.debtCounsellor.update).toHaveBeenCalledWith({
            where: { id: 'dc1' },
            data: { preferredEmail: 'new@dc.co.za' },
        });
    });

    it('drops the priority-5 entry when the list is full', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue(
            [1, 2, 3, 4, 5].map((p) => row({ id: `e${p}`, email: `p${p}@dc.co.za`, priority: p }))
        );

        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'sixth@dc.co.za',
            source: 'DECLINE_EXTRACTED',
        });

        expect(result.promoted).toBe(true);
        expect(result.droppedEmail).toBe(`p${MAX_PRIORITY_EMAILS}@dc.co.za`);
        expect(mockDb.debtCounsellorEmail.delete).toHaveBeenCalledWith({ where: { id: 'e5' } });
    });

    it('re-promotes an existing lower-priority email and clears its bounce flag', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'top@dc.co.za', priority: 1 }),
            row({ id: 'e2', email: 'again@dc.co.za', priority: 2, lastBouncedAt: new Date() }),
        ]);

        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'again@dc.co.za',
            source: 'DECLINE_EXTRACTED',
        });

        expect(result.promoted).toBe(true);
        expect(mockDb.debtCounsellorEmail.create).not.toHaveBeenCalled();
        expect(mockDb.debtCounsellorEmail.update).toHaveBeenCalledWith({
            where: { id: 'e2' },
            data: expect.objectContaining({ priority: 1, lastBouncedAt: null, bounceReason: null }),
        });
    });

    it('is a no-op when the email is already priority 1 and healthy', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'top@dc.co.za', priority: 1 }),
        ]);

        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'TOP@dc.co.za',
            source: 'DECLINE_EXTRACTED',
        });

        expect(result.alreadyPriorityOne).toBe(true);
        expect(mockDb.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid email without touching the database', async () => {
        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'not-an-email',
            source: 'STAFF',
        });

        expect(result.promoted).toBe(false);
        expect(result.reason).toContain('Invalid email');
        expect(mockDb.debtCounsellorEmail.findMany).not.toHaveBeenCalled();
    });

    it('never throws when the database fails', async () => {
        mockDb.debtCounsellorEmail.findMany.mockRejectedValue(new Error('db down'));

        const result = await promoteDcEmail({
            debtCounsellordId: 'dc1',
            email: 'x@dc.co.za',
            source: 'DHS',
        });

        expect(result.promoted).toBe(false);
        expect(result.reason).toBe('db down');
    });
});

describe('getBestDcEmail', () => {
    it('skips bounced entries and returns the next priority', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'p1@dc.co.za', priority: 1, lastBouncedAt: new Date() }),
            row({ id: 'e2', email: 'p2@dc.co.za', priority: 2 }),
        ]);

        const best = await getBestDcEmail('dc1');
        expect(best).toEqual({ email: 'p2@dc.co.za', priority: 2 });
    });

    it('returns null when every entry has bounced', async () => {
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'p1@dc.co.za', priority: 1, lastBouncedAt: new Date() }),
        ]);

        expect(await getBestDcEmail('dc1')).toBeNull();
    });
});

describe('recordDcEmailBounce', () => {
    it('flags the address and syncs preferredEmail to the next usable entry', async () => {
        mockDb.debtCounsellorEmail.findFirst.mockResolvedValue(row({ id: 'e1', email: 'p1@dc.co.za' }));
        mockDb.debtCounsellorEmail.findMany.mockResolvedValue([
            row({ id: 'e1', email: 'p1@dc.co.za', priority: 1, lastBouncedAt: new Date() }),
            row({ id: 'e2', email: 'p2@dc.co.za', priority: 2 }),
        ]);

        const result = await recordDcEmailBounce({
            debtCounsellordId: 'dc1',
            email: 'P1@dc.co.za',
            reason: 'Mailbox full',
        });

        expect(result.flagged).toBe(true);
        expect(result.nextBest).toEqual({ email: 'p2@dc.co.za', priority: 2 });
        expect(mockDb.debtCounsellorEmail.update).toHaveBeenCalledWith({
            where: { id: 'e1' },
            data: expect.objectContaining({ bounceReason: 'Mailbox full' }),
        });
        expect(mockDb.debtCounsellor.update).toHaveBeenCalledWith({
            where: { id: 'dc1' },
            data: { preferredEmail: 'p2@dc.co.za' },
        });
    });
});

describe('seedDcPriorityEmails', () => {
    it('seeds preferred → lastKnown → dhs email order, deduplicated', async () => {
        mockDb.debtCounsellorEmail.count.mockResolvedValue(0);

        const created = await seedDcPriorityEmails({
            id: 'dc1',
            preferredEmail: 'pref@dc.co.za',
            lastKnownEmail: 'PREF@dc.co.za', // duplicate of preferred
            email: 'dhs@dc.co.za',
        });

        expect(created).toBe(2);
        expect(mockDb.debtCounsellorEmail.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ email: 'pref@dc.co.za', priority: 1 }),
        });
        expect(mockDb.debtCounsellorEmail.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ email: 'dhs@dc.co.za', priority: 2 }),
        });
    });

    it('skips DCs that already have a priority list', async () => {
        mockDb.debtCounsellorEmail.count.mockResolvedValue(3);

        const created = await seedDcPriorityEmails({
            id: 'dc1',
            preferredEmail: 'pref@dc.co.za',
            lastKnownEmail: null,
            email: null,
        });

        expect(created).toBe(0);
        expect(mockDb.debtCounsellorEmail.create).not.toHaveBeenCalled();
    });
});
