import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        caseComment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
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
import { GET, POST } from './route';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    caseComment: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
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
    mockedAuth.mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF', name: 'Kenneth Mokgoshi' } });
    db.case.findUnique.mockResolvedValue(baseCase);
    db.caseComment.findMany.mockResolvedValue([]);
    db.caseComment.findFirst.mockResolvedValue(null);
    db.caseComment.create.mockResolvedValue({ id: 'comment-1', createdAt: new Date('2026-07-24T09:00:00Z') });
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

    mockedScan.mockImplementation(async ({ onFoldersResolved, onRawMatches }: any) => {
        onFoldersResolved?.(['INBOX', 'Sent']);
        onRawMatches?.(1);
        return [
            {
                messageId: 'msg-1',
                from: 'debtcounsellor@firm.co.za',
                to: 'ops@zenowethu.co.za',
                subject: 'Transfer complete',
                date: '2026-07-23T10:00:00Z',
                body: 'Hello, the transfer is complete. Find Form 17.W attached.',
                folder: 'INBOX',
                attachments: [
                    {
                        fileName: 'form_17w.pdf',
                        mimeType: 'application/pdf',
                        buffer: Buffer.from('mock-pdf'),
                        detectedType: 'FORM_17W',
                    },
                ],
            },
        ];
    });

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

    it('takes no action on an irrelevant email that carries no attachments', async () => {
        mockedScan.mockImplementation(async ({ onFoldersResolved }: any) => {
            onFoldersResolved?.(['INBOX', 'Sent']);
            return [
                {
                    messageId: 'msg-2',
                    from: 'newsletter@spam.co.za',
                    to: 'ops@zenowethu.co.za',
                    subject: 'Weekly deals',
                    date: '2026-07-23T10:00:00Z',
                    body: 'Buy now!',
                    folder: 'INBOX',
                    attachments: [],
                },
            ];
        });
        mockedAnalyze.mockResolvedValue({
            isRelevant: false,
            hasUpdate: false,
            updateSummary: 'Spam/Unrelated',
            consumerNotificationMsg: null,
        });

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.updates).toHaveLength(0);
        expect(db.document.create).not.toHaveBeenCalled();
        // No per-email comment (neither update nor documents)...
        expect(db.caseComment.create).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ activityType: 'CASE_EMAIL_UPDATE_PROCESSED' }),
            }),
        );
        expect(db.caseComment.create).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ activityType: 'CASE_DOCUMENTS_HARVESTED' }),
            }),
        );
        // ...but the scan run itself is still logged.
        expect(db.caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ activityType: 'CASE_UPDATE_SCAN_RUN' }),
            }),
        );
    });

    it('harvests attachments from a client-matched email even when the AI finds no textual update', async () => {
        // "please find attached" delivery — matched the client, has documents,
        // but the body carries no status update.
        mockedAnalyze.mockResolvedValue({
            isRelevant: true,
            hasUpdate: false,
            updateSummary: 'Document delivery, no textual update.',
            consumerNotificationMsg: null,
        });

        const res = await POST(request({ lookbackDays: 90 }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        // Attachment saved despite hasUpdate=false
        expect(db.document.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ type: 'FORM_17W', fileName: 'form_17w.pdf' }),
        }));
        // Logged as a documents-harvest (not an AI update) and NOT notified
        expect(db.caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ activityType: 'CASE_DOCUMENTS_HARVESTED' }),
            }),
        );
        expect(mockedSend).not.toHaveBeenCalled();
        expect(json.updates).toHaveLength(1);
        expect(json.updates[0].documentsOnly).toBe(true);
        expect(json.updates[0].attachments).toHaveLength(1);
        expect(json.scanRun.documentsHarvested).toBe(1);
        expect(json.scanRun.updatesFound).toBe(0);
        expect(json.scanRun.candidatesFound).toBe(1);
    });

    it('flags AI-analysis failures in the scan run while still harvesting documents', async () => {
        // analyzeEmailForCaseUpdate fell back to its error result
        mockedAnalyze.mockResolvedValue({
            isRelevant: false,
            hasUpdate: false,
            updateSummary: 'Failed to analyze due to fallback/error.',
            consumerNotificationMsg: null,
        });

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.scanRun.aiFailures).toBe(1);
        // Attachment still harvested despite the AI failure
        expect(db.document.create).toHaveBeenCalled();
        expect(json.scanRun.documentsHarvested).toBe(1);
    });

    it('always logs a scan-run entry with who/when/mailboxes/folders, even with no updates', async () => {
        mockedScan.mockImplementation(async ({ onFoldersResolved }: any) => {
            onFoldersResolved?.(['INBOX', 'Sent']);
            return [];
        });

        const res = await POST(request({ lookbackDays: 90 }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.updates).toHaveLength(0);
        expect(json.scanRun).toBeDefined();
        expect(json.scanRun.ranByName).toBe('Kenneth Mokgoshi');
        expect(json.scanRun.scannedInbox).toBe(true);
        expect(json.scanRun.scannedSent).toBe(true);
        expect(json.scanRun.mailboxes).toContain('ops@zenowethu.co.za');

        const scanRunCall = db.caseComment.create.mock.calls.find(
            (c: any[]) => c[0]?.data?.activityType === 'CASE_UPDATE_SCAN_RUN',
        );
        expect(scanRunCall).toBeTruthy();
        const activityData = JSON.parse(scanRunCall![0].data.activityData);
        expect(activityData.ranByName).toBe('Kenneth Mokgoshi');
        expect(activityData.scannedInbox).toBe(true);
        expect(activityData.scannedSent).toBe(true);
        expect(db.workflowLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'CASE_UPDATE_SCAN_RUN' }),
            }),
        );
    });

    it('reports raw server-search matches for diagnostics', async () => {
        const res = await POST(request({ lookbackDays: 90 }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.scanRun.rawMatches).toBe(1);

        const scanRunCall = db.caseComment.create.mock.calls.find(
            (c: any[]) => c[0]?.data?.activityType === 'CASE_UPDATE_SCAN_RUN',
        );
        const activityData = JSON.parse(scanRunCall![0].data.activityData);
        expect(activityData.rawMatches).toBe(1);
    });

    it('notes when server matches exist but were all already processed', async () => {
        // Server matched msg-1, but it was processed on a previous run.
        db.caseComment.findMany.mockResolvedValue([
            { activityData: JSON.stringify({ messageId: 'msg-1' }) },
        ]);
        // Scanner still reports the raw match count even though it excludes the
        // already-seen message from its returned list.
        mockedScan.mockImplementation(async ({ onFoldersResolved, onRawMatches }: any) => {
            onFoldersResolved?.(['INBOX', 'Sent']);
            onRawMatches?.(1);
            return []; // msg-1 excluded via skipMessageIds
        });

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.scanRun.rawMatches).toBe(1);
        expect(json.scanRun.candidatesFound).toBe(0);
        const scanRunCall = db.caseComment.create.mock.calls.find(
            (c: any[]) => c[0]?.data?.activityType === 'CASE_UPDATE_SCAN_RUN',
        );
        expect(scanRunCall![0].data.content).toContain('already processed');
    });

    it('forceRescan ignores the already-processed skip list and suppresses notifications', async () => {
        // msg-1 was processed before, so a normal run would skip it.
        db.caseComment.findMany.mockResolvedValue([
            { activityData: JSON.stringify({ messageId: 'msg-1' }) },
        ]);

        const res = await POST(request({ lookbackDays: 90, forceRescan: true }), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        // Re-examined despite being on the skip list → attachment re-harvested
        expect(db.document.create).toHaveBeenCalled();
        expect(json.updates).toHaveLength(1);
        // Force re-scan never notifies the consumer, even on a real update
        expect(mockedSend).not.toHaveBeenCalled();
        expect(json.scanRun.forceRescan).toBe(true);

        // scanMailboxForCaseUpdates received an empty skip list
        const scanArgs = mockedScan.mock.calls[0][0];
        expect(scanArgs.skipMessageIds).toEqual([]);
    });

    it('records a per-mailbox error when a mailbox scan throws', async () => {
        mockedScan.mockRejectedValue(new Error('IMAP auth failed'));

        const res = await POST(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.scanRun.errors).toEqual(['ops@zenowethu.co.za: IMAP auth failed']);
    });
});

describe('GET /check-updates (last scan lookup)', () => {
    it('rejects unauthenticated callers', async () => {
        mockedAuth.mockResolvedValue(null);
        const res = await GET(request(), ctx);
        expect(res.status).toBe(401);
    });

    it('returns lastScan: null when no scan has run', async () => {
        db.caseComment.findFirst.mockResolvedValue(null);
        const res = await GET(request(), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.lastScan).toBeNull();
    });

    it('returns the most recent scan metadata', async () => {
        db.caseComment.findFirst.mockResolvedValue({
            createdAt: new Date('2026-07-24T09:00:00Z'),
            user: { firstName: 'Kenneth', lastName: 'Mokgoshi' },
            activityData: JSON.stringify({
                ranByName: 'Kenneth Mokgoshi',
                lookbackDays: 180,
                mailboxes: [{ email: 'ops@zenowethu.co.za', folders: ['INBOX', 'Sent'] }],
                scannedInbox: true,
                scannedSent: true,
                updatesFound: 2,
                updates: [{ subject: 'Transfer complete' }],
                errors: [],
            }),
        });

        const res = await GET(request(), ctx);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.lastScan.ranByName).toBe('Kenneth Mokgoshi');
        expect(json.lastScan.scannedInbox).toBe(true);
        expect(json.lastScan.scannedSent).toBe(true);
        expect(json.lastScan.mailboxes).toEqual(['ops@zenowethu.co.za']);
        expect(json.lastScan.updates).toHaveLength(1);
    });
});
