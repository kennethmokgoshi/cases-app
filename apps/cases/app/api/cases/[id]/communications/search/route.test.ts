import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        notificationLog: { findMany: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/lib/mailbox-search', () => ({
    searchConsumerAcrossMailboxes: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { searchConsumerAcrossMailboxes } from '@/lib/mailbox-search';
import { POST } from './route';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    notificationLog: { findMany: ReturnType<typeof vi.fn> };
};
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedSweep = searchConsumerAcrossMailboxes as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown> = {}): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/communications/search', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
const ctx = { params: Promise.resolve({ id: 'case-1' }) };

const baseCase = {
    id: 'case-1',
    fileNumber: 'ZDM-2026-001',
    client: { idNumber: '8001015009087', firstName: 'Sipho', lastName: 'Dlamini', email: 'sipho@example.com' },
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } });
    db.case.findUnique.mockResolvedValue(baseCase);
    db.notificationLog.findMany.mockResolvedValue([]);
    mockedSweep.mockResolvedValue({ searchedMailboxes: 0, skippedMailboxes: 0, matches: [], perMailbox: [], errors: [] });
});

describe('POST /communications/search', () => {
    it('rejects unauthenticated callers', async () => {
        mockedAuth.mockResolvedValue(null);
        const res = await POST(request(), ctx);
        expect(res.status).toBe(401);
    });

    it('forbids B2B partner users', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'p1', userType: 'B2B_PARTNER' } });
        const res = await POST(request(), ctx);
        expect(res.status).toBe(403);
    });

    it('422s when the consumer has no ID number and no full name', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            client: { idNumber: null, firstName: null, lastName: null, email: null },
        });
        const res = await POST(request(), ctx);
        expect(res.status).toBe(422);
    });

    it('returns outbound matches and searches the inbox by ID and name', async () => {
        db.notificationLog.findMany.mockResolvedValue([
            {
                id: 'n1', caseId: 'case-1', channel: 'EMAIL', recipient: 'dc@firm.co.za', recipientType: 'DC',
                success: true, provider: 'SMTP', sentAt: new Date('2026-07-05T10:00:00Z'),
                message: 'Regarding Sipho Dlamini ID 8001015009087 please send docs',
            },
        ]);
        mockedSweep.mockResolvedValue({
            searchedMailboxes: 2, skippedMailboxes: 0, errors: [],
            matches: [{ mailbox: 'ops@zenowethu.co.za', uid: 5, from: 'dc@firm.co.za', to: 'ops', subject: 'Re: transfer', date: '2026-07-06T08:00:00.000Z', seen: false, matchedOn: ['ID_NUMBER'] }],
        });

        const res = await POST(request({ lookbackDays: 90 }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.summary.total).toBe(2);
        expect(json.notifications[0].matchedOn).toContain('ID_NUMBER');
        expect(json.notifications[0].matchedOn).toContain('NAME');
        expect(json.inbox.matches).toHaveLength(1);
        // The sweep was asked for both identifiers.
        expect(mockedSweep).toHaveBeenCalledWith(expect.objectContaining({
            idNumber: '8001015009087', firstName: 'Sipho', lastName: 'Dlamini',
        }));
    });

    it('skips the inbox sweep when includeInbox is false', async () => {
        const res = await POST(request({ includeInbox: false }), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.inbox.searched).toBe(false);
        expect(mockedSweep).not.toHaveBeenCalled();
    });
});
