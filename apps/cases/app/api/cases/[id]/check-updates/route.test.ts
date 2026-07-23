import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        caseComment: { findMany: vi.fn(), create: vi.fn() },
        document: { findFirst: vi.fn(), create: vi.fn() },
        workflowLog: { create: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@zenowethu/shared-lib/src/integrations/imap', () => ({
    scanMailboxForCaseUpdates: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/ai/case-updates', () => ({
    analyzeEmailForCaseUpdate: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));

vi.mock('@/lib/mailbox-search', () => ({
    getSearchableMailboxesWithPasswords: vi.fn(),
}));

// Mock standard fs functions to avoid disk writes in unit tests
vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { scanMailboxForCaseUpdates } from '@zenowethu/shared-lib/src/integrations/imap';
import { analyzeEmailForCaseUpdate } from '@zenowethu/shared-lib/src/ai/case-updates';
import { sendManualMessage } from '@zenowethu/shared-lib/src/notifications/service';
import { getSearchableMailboxesWithPasswords } from '@/lib/mailbox-search';
import { POST } from './route';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    caseComment: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    document: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    workflowLog: { create: ReturnType<typeof vi.fn> };
};
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedScan = scanMailboxForCaseUpdates as unknown as ReturnType<typeof vi.fn>;
const mockedAnalyze = analyzeEmailForCaseUpdate as unknown as ReturnType<typeof vi.fn>;
const mockedSend = sendManualMessage as unknown as ReturnType<typeof vi.fn>;
const mockedGetMailboxes = getSearchableMailboxesWithPasswords as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown> = {}): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/check-updates', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
const ctx = { params: Promise.resolve({ id: 'case-1' }) };

const baseCase = {
    id: 'case-1',
    fileNumber: 'ZDM-2026-001',
    status: 'ACTIVE',
    client: { idNumber: '8001015009087', firstName: 'Sipho', lastName: 'Dlamini', email: 'sipho@example.com', phone: '0823638207' },
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } });
    db.case.findUnique.mockResolvedValue(baseCase);
    db.caseComment.findMany.mockResolvedValue([]);
    db.caseComment.create.mockResolvedValue({ id: 'comment-1' });
    db.workflowLog.create.mockResolvedValue({ id: 'wf-1' });
    db.document.findFirst.mockResolvedValue(null);
    db.document.create.mockResolvedValue({ id: 'doc-1' });

    mockedGetMailboxes.mockResolvedValue([
        {
            id: 'mb-1',
            label: 'Ops',
            emailAddress: 'ops@zenowethu.co.za',
            imapHost: 'imap.gmail.com',
            imapPort: 993,
            imapSecure: true,
            password: 'secret-password',
        },
    ]);

    mockedScan.mockResolvedValue([
        {
            messageId: 'msg-1',
            from: 'debtcounsellor@firm.co.za',
            to: 'ops@zenowethu.co.za',
            subject: 'Transfer complete',
            date: '2026-07-23T10:00:00Z',
            body: 'Hello, the transfer is complete. Find Form 17.W attached.',
            attachments: [
                {
                    fileName: 'form_17w.pdf',
                    mimeType: 'application/pdf',
                    buffer: Buffer.from('mock-pdf'),
                    detectedType: 'FORM_17W',
                },
            ],
        },
    ]);

    mockedAnalyze.mockResolvedValue({
        isRelevant: true,
        hasUpdate: true,
        updateSummary: 'Debt counsellor confirmed transfer is complete and sent Form 17.W.',
        counsellorRequestedForm: false,
        counsellorAcknowledgement: true,
        providerAcknowledgement: false,
        consumerNotificationMsg: 'Good news! Your transfer has been completed by your debt counsellor.',
    });

    mockedSend.mockResolvedValue({
        smsSuccess: true,
        emailSuccess: true,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: [],
    });
});

describe('POST /check-updates', () => {
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

    it('scans mailbox, processes updates via AI, saves attachments, and notifies consumer', async () => {
        const res = await POST(request({ lookbackDays: 90 }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.updates).toHaveLength(1);
        expect(json.updates[0].summary).toBe('Debt counsellor confirmed transfer is complete and sent Form 17.W.');
        expect(json.updates[0].notificationSent).toBe(true);
        expect(json.updates[0].attachments).toHaveLength(1);

        // Verify attachment creation
        expect(db.document.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'FORM_17W',
                fileName: 'form_17w.pdf',
            }),
        }));

        // Verify notifications sent
        expect(mockedSend).toHaveBeenCalledTimes(2); // One SMS, one EMAIL

        // Verify comment logging
        expect(db.caseComment.create).toHaveBeenCalled();
        expect(db.workflowLog.create).toHaveBeenCalled();
    });

    it('skips already processed message IDs', async () => {
        // Mock that msg-1 was already processed in comments
        db.caseComment.findMany.mockResolvedValue([
            { activityData: JSON.stringify({ messageId: 'msg-1' }) },
        ]);

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.updates).toHaveLength(0); // Scanned, but skipped msg-1
    });

    it('gracefully handles irrelevant emails', async () => {
        mockedAnalyze.mockResolvedValue({
            isRelevant: false,
            hasUpdate: false,
            updateSummary: 'Spam/Unrelated',
            consumerNotificationMsg: null,
        });

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.updates).toHaveLength(0); // No updates logged
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });
});
