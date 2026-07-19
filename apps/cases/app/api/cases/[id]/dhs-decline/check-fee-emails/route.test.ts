import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib/src/security/encryption', () => ({
    decryptSecret: vi.fn(val => val),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
        caseComment: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        workflowLog: {
            create: vi.fn(),
        },
        mailboxAccount: {
            findMany: vi.fn(),
        },
        document: {
            create: vi.fn(),
            findFirst: vi.fn(),
        },
        user: {
            findFirst: vi.fn(),
        },
        processedMailboxMessage: {
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
    getSMTPCredentials: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/integrations/imap', () => ({
    scanMailboxForClient: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { auth, getSMTPCredentials } from '@zenowethu/shared-lib';
import { scanMailboxForClient } from '@zenowethu/shared-lib/src/integrations/imap';
import { POST } from './route';

type PrismaMock = {
    case: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    caseComment: {
        findMany: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };
    workflowLog: {
        create: ReturnType<typeof vi.fn>;
    };
    mailboxAccount: {
        findMany: ReturnType<typeof vi.fn>;
    };
    document: {
        create: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
    };
    user: {
        findFirst: ReturnType<typeof vi.fn>;
    };
    processedMailboxMessage: {
        findMany: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
    };
};

const db = prisma as unknown as PrismaMock;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedSmtp = getSMTPCredentials as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown> = {}): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

async function parseResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/x-ndjson') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const chunks: any[] = [];
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) {
                    chunks.push(JSON.parse(line));
                }
            }
        }
        if (buffer.trim()) {
            chunks.push(JSON.parse(buffer));
        }
        const completeChunk = chunks.find(c => c.type === 'complete');
        return completeChunk ? completeChunk.data : chunks[chunks.length - 1];
    }
    return response.json();
}

const params = { params: Promise.resolve({ id: 'case-1' }) };

const MAILBOXES = [
    {
        id: 'mbx-transfers',
        label: 'Transfers',
        emailAddress: 'transfers@zenowethu.co.za',
        isDcCommunication: true,
        password: 'enc:v1:xx:yy:zz',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapSecure: true,
    },
    {
        id: 'mbx-notifications',
        label: 'Notifications',
        emailAddress: 'notifications@zenowethu.co.za',
        isDcCommunication: false,
        password: null,
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapSecure: true,
    },
];

const STRICT_MATCH_POLICY = {
    requiredIdentifierType: 'CLIENT_ID_NUMBER',
    requiredIdentifierValue: '8912015638081',
    serverSideSearchRequired: true,
    openOrFetchOnlyAfterIdentifierMatch: true,
    nonMatchingEmailAction: 'SKIP_WITHOUT_OPENING',
};

describe('POST /api/cases/[id]/dhs-decline/check-fee-emails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.DC_FEE_INBOX_PROVIDER;
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.case.findUnique.mockResolvedValue({
            id: 'case-1',
            fileNumber: 'ZEN-001',
            status: 'REJECTED_OWES_FEES',
            declineReason: 'Consumer owes fees',
            client: {
                firstName: 'Mfuneko',
                lastName: 'Lubenye',
                idNumber: '8912015638081',
                email: 'mfuneko@example.com',
            },
        });
        db.caseComment.findMany.mockResolvedValue([]);
        db.caseComment.create.mockResolvedValue({ id: 'comment-1' });
        db.workflowLog.create.mockResolvedValue({ id: 'workflow-1' });
        db.mailboxAccount.findMany.mockResolvedValue(MAILBOXES);
        db.document.create.mockResolvedValue({ id: 'doc-1' });
        db.document.findFirst.mockResolvedValue(null);
        db.processedMailboxMessage.findMany.mockResolvedValue([]);
        db.processedMailboxMessage.upsert.mockResolvedValue({ id: 'pm-1' });
        db.user.findFirst.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
        mockedSmtp.mockResolvedValue({ username: '', password: '' });
        (scanMailboxForClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            emailsScanned: 5,
            newEmailsFound: 2,
            invoiceCandidatesFound: 1,
            attachments: [
                {
                    fileName: 'invoice-1.pdf',
                    mimeType: 'application/pdf',
                    buffer: Buffer.from('mock-pdf'),
                    isPoP: false,
                    isInvoice: true,
                }
            ],
        });
    });

    it('logs a fee-invoice email check across all registered mailboxes by default', async () => {
        const response = await POST(
            request({ lookbackDays: 120, receivedAfter: '2026-05-11T00:00:00.000Z', reason: 'Fees owed' }),
            params
        );
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        // Completed synchronously, so scanQueued is false
        expect(body.scanQueued).toBe(false);
        expect(body.inboxConfigured).toBe(true);
        expect(body.mailboxes).toHaveLength(2);
        expect(body.scanSummary).toMatchObject({
            status: 'COMPLETED',
            idNumberMatchRequired: true,
            idNumberMatchValue: '8912015638081',
            selectedMailboxCount: 2,
            readableMailboxCount: 1,
            skippedMailboxCount: 1,
            emailsScanned: 5,
            newEmailsFound: 2,
            invoiceCandidatesFound: 1,
            uploadedDocuments: 1,
        });
        expect(db.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                userId: 'staff-1',
                activityType: 'DHS_FEE_EMAIL_SCAN_REQUESTED',
                content: expect.stringContaining('8912015638081'),
            }),
        }));
        const activityData = JSON.parse(db.caseComment.create.mock.calls[0][0].data.activityData);
        expect(activityData.mailboxScope).toBe('ALL');
        expect(activityData.scanSummary.readableMailboxCount).toBe(1);
        expect(activityData.matchPolicy).toEqual({
            requiredIdentifierType: 'CLIENT_ID_NUMBER',
            requiredIdentifierValue: '8912015638081',
            serverSideSearchRequired: true,
            openOrFetchOnlyAfterIdentifierMatch: true,
            nonMatchingEmailAction: 'SKIP_WITHOUT_OPENING',
        });
        expect(db.caseComment.create.mock.calls[0][0].data.content).toContain('Mailbox summary: 2 selected, 1 readable, 1 skipped.');
        expect(db.caseComment.create.mock.calls[0][0].data.content).toContain('only emails containing client ID number 8912015638081 may be opened/read');
        expect(db.caseComment.create.mock.calls[0][0].data.content).toContain('Email counts: 5 scanned, 2 new, 1 invoice/PoP candidates, 1 documents uploaded.');
        expect(activityData.mailboxes.map((m: { id: string }) => m.id)).toEqual([
            'mbx-transfers',
            'mbx-notifications',
        ]);
        expect(db.workflowLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                action: 'DHS_FEE_EMAIL_SCAN_REQUESTED',
            }),
        }));
    });

    it('searches a single selected mailbox when mailboxId is provided', async () => {
        const response = await POST(request({ mailboxId: 'mbx-transfers' }), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.mailboxes).toHaveLength(1);
        expect(body.mailboxes[0].emailAddress).toBe('transfers@zenowethu.co.za');
        const activityData = JSON.parse(db.caseComment.create.mock.calls[0][0].data.activityData);
        expect(activityData.mailboxScope).toBe('mbx-transfers');
    });

    it('rejects a mailbox the caller may not use', async () => {
        const response = await POST(request({ mailboxId: 'someone-elses-mailbox' }), params);

        expect(response.status).toBe(404);
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('reports not configured when no selected mailbox has a saved password', async () => {
        db.mailboxAccount.findMany.mockResolvedValue([MAILBOXES[1]]);

        const response = await POST(request({ mailboxId: 'mbx-notifications' }), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.scanQueued).toBe(false);
        expect(body.inboxConfigured).toBe(false);
        expect(body.scanSummary.status).toBe('NOT_CONFIGURED');
        expect(body.scanSummary.readableMailboxCount).toBe(0);
        expect(body.message).toContain('Save mailbox passwords');
    });

    it('treats a mailbox matching the SMTP account login as configured', async () => {
        db.mailboxAccount.findMany.mockResolvedValue([MAILBOXES[1]]);
        mockedSmtp.mockResolvedValue({ username: 'notifications@zenowethu.co.za', password: 'smtp-secret' });

        const response = await POST(request({ mailboxId: 'mbx-notifications' }), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.scanQueued).toBe(false);
        expect(body.inboxConfigured).toBe(true);
    });

    it('does not create another request for the same mailbox scope in the 24-hour window', async () => {
        db.caseComment.findMany.mockResolvedValue([
            {
                id: 'existing-comment',
                createdAt: new Date('2026-07-11T08:00:00.000Z'),
                activityData: JSON.stringify({ mailboxScope: 'ALL', matchPolicy: STRICT_MATCH_POLICY }),
            },
        ]);

        const response = await POST(request({ lookbackDays: 90 }), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.duplicate).toBe(true);
        expect(body.scanQueued).toBe(false);
        expect(body.scanSummary.status).toBe('DUPLICATE');
        expect(body.scanSummary.idNumberMatchValue).toBe('8912015638081');
        expect(body.activityId).toBe('existing-comment');
        expect(db.caseComment.create).not.toHaveBeenCalled();
        expect(db.workflowLog.create).not.toHaveBeenCalled();
    });

    it('allows checking a different mailbox even when another scope was checked today', async () => {
        db.caseComment.findMany.mockResolvedValue([
            {
                id: 'existing-comment',
                createdAt: new Date('2026-07-11T08:00:00.000Z'),
                activityData: JSON.stringify({ mailboxScope: 'ALL', matchPolicy: STRICT_MATCH_POLICY }),
            },
        ]);

        const response = await POST(request({ mailboxId: 'mbx-transfers' }), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.duplicate).toBe(false);
        expect(db.caseComment.create).toHaveBeenCalled();
    });

    it('supersedes legacy requests that do not have the strict ID-number match policy', async () => {
        db.caseComment.findMany.mockResolvedValue([
            {
                id: 'legacy-comment',
                createdAt: new Date('2026-07-11T08:00:00.000Z'),
                activityData: JSON.stringify({ action: 'CHECK_DC_FEE_INVOICE_EMAILS' }),
            },
        ]);

        const response = await POST(request(), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.duplicate).toBe(false);
        expect(db.caseComment.create).toHaveBeenCalled();
    });

    it('rejects unauthenticated and partner users', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        expect((await POST(request(), params)).status).toBe(401);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'partner-1', userType: 'B2B_PARTNER' } });
        expect((await POST(request(), params)).status).toBe(403);
    });

    it('returns 404 when the case does not exist', async () => {
        db.case.findUnique.mockResolvedValue(null);

        const response = await POST(request(), params);

        expect(response.status).toBe(404);
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('does not queue an inbox scan when the client has no ID number to match against', async () => {
        db.case.findUnique.mockResolvedValue({
            id: 'case-1',
            fileNumber: 'ZEN-001',
            status: 'REJECTED_OWES_FEES',
            declineReason: 'Consumer owes fees',
            client: {
                firstName: 'Mfuneko',
                lastName: 'Lubenye',
                idNumber: '',
                email: 'mfuneko@example.com',
            },
        });

        const response = await POST(request(), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(422);
        expect(body.error).toContain('client ID number');
        expect(db.mailboxAccount.findMany).not.toHaveBeenCalled();
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('returns 400 for malformed JSON', async () => {
        const response = await POST(
            new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails', {
                method: 'POST',
                body: '{not-json',
            }),
            params
        );

        expect(response.status).toBe(400);
        expect(db.case.findUnique).not.toHaveBeenCalled();
    });
});
