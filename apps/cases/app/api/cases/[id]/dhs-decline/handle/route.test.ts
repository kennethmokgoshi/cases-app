import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: { case: { findUnique: vi.fn() } },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@zenowethu/shared-lib/src/dhs', () => ({
    handleDHSDecline: vi.fn(),
    classifyDeclineReasonSmart: vi.fn(),
    extractEmailFromReason: vi.fn(() => null),
    findPriorDocsEmail: vi.fn(),
    decideDocsResend: vi.fn(),
}));

vi.mock('@/lib/mailbox-search', () => ({
    searchConsumerAcrossMailboxes: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import {
    handleDHSDecline,
    classifyDeclineReasonSmart,
    findPriorDocsEmail,
    decideDocsResend,
} from '@zenowethu/shared-lib/src/dhs';
import { searchConsumerAcrossMailboxes } from '@/lib/mailbox-search';
import { POST } from './route';

const db = prisma as unknown as { case: { findUnique: ReturnType<typeof vi.fn> } };
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedHandle = handleDHSDecline as unknown as ReturnType<typeof vi.fn>;
const mockedClassify = classifyDeclineReasonSmart as unknown as ReturnType<typeof vi.fn>;
const mockedPrior = findPriorDocsEmail as unknown as ReturnType<typeof vi.fn>;
const mockedDecide = decideDocsResend as unknown as ReturnType<typeof vi.fn>;
const mockedSweep = searchConsumerAcrossMailboxes as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown> = {}): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/handle', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
const ctx = { params: Promise.resolve({ id: 'case-1' }) };

const baseCase = {
    id: 'case-1', fileNumber: 'ZDM-2026-001', createdAt: new Date('2026-07-01T00:00:00Z'),
    nextUpdate: new Date('2099-01-01T00:00:00Z'),
    declineFirstDetectedAt: new Date('2026-07-02T00:00:00Z'), declineLastDetectedAt: null,
    preferredDcEmail: 'dc@firm.co.za', lastKnownEmail: null, dcEmail: null,
    client: { idNumber: '8001015009087', firstName: 'Sipho', lastName: 'Dlamini' },
};

const handledResult = {
    category: 'SEND_DOCS', emailSent: true, smsSent: false, whatsappSent: false,
    statusUpdatedTo: 'DOCUMENTS_EMAILED', actionsPerformed: ['Documents emailed'], errors: [],
    extractedEmail: null, skippedAsDuplicate: false, alreadyHandledAt: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } });
    db.case.findUnique.mockResolvedValue(baseCase);
    mockedClassify.mockResolvedValue({ category: 'SEND_DOCS', confidence: 0.9, reasoning: 'DC asked for POA and ID.', source: 'ai' });
    mockedHandle.mockResolvedValue(handledResult);
    mockedSweep.mockResolvedValue({ searchedMailboxes: 1, skippedMailboxes: 0, matches: [], perMailbox: [], errors: [] });
});

describe('POST /dhs-decline/handle guard', () => {
    it('401s when unauthenticated', async () => {
        mockedAuth.mockResolvedValue(null);
        const res = await POST(request({ declineReason: 'x' }), ctx);
        expect(res.status).toBe(401);
    });

    it('403s for B2B partners', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'p', userType: 'B2B_PARTNER' } });
        const res = await POST(request({ declineReason: 'x' }), ctx);
        expect(res.status).toBe(403);
    });

    it('stops without resending when the sent record shows it was already handled and file not overdue', async () => {
        mockedPrior.mockResolvedValue({ found: true, sentAt: new Date('2026-07-05T10:00:00Z'), recipient: 'dc@firm.co.za' });
        mockedDecide.mockReturnValue({ send: false, skippedAsDuplicate: true, overdue: false });

        const res = await POST(request({ declineReason: 'please send POA and ID' }), ctx);
        const json = await res.json();

        expect(json.alreadyHandled).toBe(true);
        expect(json.alreadyHandledSource).toBe('NOTIFICATION_LOG');
        expect(json.canResend).toBe(true);
        expect(mockedHandle).not.toHaveBeenCalled();
        expect(mockedSweep).not.toHaveBeenCalled(); // sent record was enough
    });

    it('falls back to the inbox when the sent record is empty, and stops on a match', async () => {
        mockedPrior.mockResolvedValue({ found: false, sentAt: null, recipient: null });
        mockedSweep.mockResolvedValue({
            searchedMailboxes: 1, skippedMailboxes: 0, errors: [],
            matches: [{ mailbox: 'ops@z.co.za', uid: 1, from: 'dc@firm.co.za', to: 'ops', subject: 'Re: transfer', date: '2026-07-06T00:00:00.000Z', seen: false, matchedOn: ['ID_NUMBER'] }],
        });
        mockedDecide.mockReturnValue({ send: false, skippedAsDuplicate: true, overdue: false });

        const res = await POST(request({ declineReason: 'please send POA and ID' }), ctx);
        const json = await res.json();

        expect(mockedSweep).toHaveBeenCalled();
        expect(json.alreadyHandled).toBe(true);
        expect(json.alreadyHandledSource).toBe('INBOX');
        expect(json.inboxMatches).toHaveLength(1);
        expect(mockedHandle).not.toHaveBeenCalled();
    });

    it('proceeds to send when already handled but the file is overdue', async () => {
        mockedPrior.mockResolvedValue({ found: true, sentAt: new Date('2026-07-05T10:00:00Z'), recipient: 'dc@firm.co.za' });
        mockedDecide.mockReturnValue({ send: true, skippedAsDuplicate: false, overdue: true });

        const res = await POST(request({ declineReason: 'please send POA and ID' }), ctx);
        const json = await res.json();

        expect(mockedHandle).toHaveBeenCalled();
        expect(json.success).toBe(true);
    });

    it('bypasses the guard entirely when forceResend is true', async () => {
        const res = await POST(request({ declineReason: 'please send POA and ID', forceResend: true }), ctx);
        const json = await res.json();

        expect(mockedPrior).not.toHaveBeenCalled();
        expect(mockedHandle).toHaveBeenCalledWith(expect.objectContaining({ forceResend: true }));
        expect(json.success).toBe(true);
    });

    it('skips the guard for non-document decline categories', async () => {
        mockedClassify.mockResolvedValue({ category: 'RESUBMIT_LATER', confidence: 0.9, reasoning: 'Try again later.', source: 'ai' });
        const res = await POST(request({ declineReason: 'try again later' }), ctx);
        await res.json();
        expect(mockedPrior).not.toHaveBeenCalled();
        expect(mockedHandle).toHaveBeenCalled();
    });
});
