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
            findUnique: vi.fn(),
        },
        processedMailboxMessage: {
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        quarantinedDocument: {
            findFirst: vi.fn(),
        },
    },
}));

// The route now routes every attachment through the ownership gate rather than
// writing a Document row itself. The gate reads file contents (puppeteer / vision
// OCR), so it is stubbed here; its own behaviour is covered by
// packages/shared-lib/src/documents/verify-ownership.test.ts.
vi.mock('@zenowethu/shared-lib/src/documents/ingest', () => ({
    ingestAttachment: vi.fn(),
    hashBuffer: (buf: Buffer) => `hash-${buf.length}`,
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
    classifyScannedFolders: (folders: string[]) => ({
        scannedInbox: folders.some(f => f.trim().toLowerCase() === 'inbox'),
        scannedSent: folders.some(f => /sent/i.test(f)),
        folders,
    }),
}));

import { prisma } from '@zenowethu/database';
import { auth, getSMTPCredentials } from '@zenowethu/shared-lib';
import { scanMailboxForClient } from '@zenowethu/shared-lib/src/integrations/imap';
import { ingestAttachment } from '@zenowethu/shared-lib/src/documents/ingest';
import { POST, GET } from './route';

const mockedIngest = ingestAttachment as unknown as ReturnType<typeof vi.fn>;

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
        findUnique: ReturnType<typeof vi.fn>;
    };
    processedMailboxMessage: {
        findMany: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
    };
    quarantinedDocument: {
        findFirst: ReturnType<typeof vi.fn>;
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
        db.quarantinedDocument.findFirst.mockResolvedValue(null);
        // Default: ownership confirmed, so the attachment is attached to the case.
        mockedIngest.mockResolvedValue({
            action: 'ATTACHED',
            documentId: 'doc-1',
            attachmentHash: 'hash-1',
            verification: { verdict: 'VERIFIED', message: 'ok' },
        });
        db.user.findFirst.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
        db.user.findUnique.mockResolvedValue({ firstName: 'Thabo', lastName: 'Molefe', email: 'thabo@zenowethu.co.za' });
        mockedSmtp.mockResolvedValue({ username: '', password: '' });
        (scanMailboxForClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (args: any) => {
            args?.onFoldersResolved?.(['INBOX', '[Gmail]/Sent Mail']);
            return {
            emailsScanned: 5,
            newEmailsFound: 2,
            invoiceCandidatesFound: 1,
            foldersScanned: ['INBOX', '[Gmail]/Sent Mail'],
            attachments: [
                {
                    fileName: 'invoice-1.pdf',
                    mimeType: 'application/pdf',
                    buffer: Buffer.from('mock-pdf'),
                    isPoP: false,
                    isInvoice: true,
                    detectedType: 'FEE_INVOICE',
                }
            ],
            };
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

    it('saves harvested attachments using their detected document type (e.g. FORM_17_7 and FORM_17_1)', async () => {
        (scanMailboxForClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            emailsScanned: 2,
            newEmailsFound: 1,
            invoiceCandidatesFound: 2,
            attachments: [
                {
                    fileName: 'Form_17.1_Client.pdf',
                    mimeType: 'application/pdf',
                    buffer: Buffer.from('mock-pdf-17.1'),
                    isPoP: false,
                    isInvoice: false,
                    detectedType: 'FORM_17_1',
                },
                {
                    fileName: 'Form_17.7_Client.pdf',
                    mimeType: 'application/pdf',
                    buffer: Buffer.from('mock-pdf-17.7'),
                    isPoP: false,
                    isInvoice: false,
                    detectedType: 'FORM_17_7',
                }
            ],
        });

        mockedIngest.mockClear();

        const response = await POST(
            request({ lookbackDays: 30 }),
            params
        );

        expect(response.status).toBe(200);
        await parseResponse(response);
        expect(mockedIngest).toHaveBeenCalledTimes(2);
        expect(mockedIngest).toHaveBeenNthCalledWith(1, expect.objectContaining({
            detectedType: 'FORM_17_1',
            fileName: 'Form_17.1_Client.pdf',
            expectedIdNumber: '8912015638081',
        }));
        expect(mockedIngest).toHaveBeenNthCalledWith(2, expect.objectContaining({
            detectedType: 'FORM_17_7',
            fileName: 'Form_17.7_Client.pdf',
            expectedIdNumber: '8912015638081',
        }));
    });

    it('never searches by client name — only the ID number may match an email', async () => {
        // Two consumers can share a name; matching on it pulls another consumer's
        // documents onto this case, contradicting the route's own match policy.
        await parseResponse(await POST(request(), params));

        const scanArgs = (scanMailboxForClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(scanArgs.idNumber).toBe('8912015638081');
        expect(scanArgs.clientName).toBeUndefined();
    });

    it('reports a blocked document and does not count it as uploaded', async () => {
        mockedIngest.mockResolvedValueOnce({
            action: 'QUARANTINED',
            quarantineId: 'q-1',
            attachmentHash: 'hash-1',
            verification: {
                verdict: 'MISMATCH',
                message: 'Blocked: this document contains ID number 8001015009087, but this case belongs to 8912015638081.',
            },
        });

        const response = await POST(request(), params);
        const body = await parseResponse(response);

        expect(response.status).toBe(200);
        expect(body.quarantinedDocuments).toHaveLength(1);
        expect(body.quarantinedDocuments[0].fileName).toBe('invoice-1.pdf');
        expect(body.scanSummary.uploadedDocuments).toBe(0);

        const content = db.caseComment.create.mock.calls[0][0].data.content as string;
        expect(content).toContain('BLOCKED');
        expect(content).toContain('belong to a different consumer');
    });

    it('records who ran the scan and which folders (inbox/sent) were searched', async () => {
        const response = await POST(request({ docGroup: 'ID_POA' }), params);
        await parseResponse(response);

        const activityData = JSON.parse(db.caseComment.create.mock.calls[0][0].data.activityData);
        expect(activityData.runBy).toMatchObject({
            id: 'staff-1',
            name: 'Thabo Molefe',
            email: 'thabo@zenowethu.co.za',
        });
        expect(activityData.foldersScanned).toEqual(['INBOX', '[Gmail]/Sent Mail']);
        expect(activityData.scannedInbox).toBe(true);
        expect(activityData.scannedSent).toBe(true);
        expect(activityData.docGroup).toBe('ID_POA');

        const content = db.caseComment.create.mock.calls[0][0].data.content as string;
        expect(content).toContain('run by Thabo Molefe');
        expect(content).toContain('Folders scanned: INBOX, [Gmail]/Sent Mail (Inbox: yes, Sent: yes).');
    });
});

describe('GET /api/cases/[id]/dhs-decline/check-fee-emails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
    });

    function getRequest(docGroup?: string): Request {
        const url = docGroup
            ? `https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails?docGroup=${docGroup}`
            : 'https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails';
        return new Request(url, { method: 'GET' });
    }

    it('returns the most recent scan for the requested docGroup', async () => {
        db.caseComment.findMany.mockResolvedValue([
            {
                id: 'scan-credit',
                createdAt: new Date('2026-07-24T09:00:00.000Z'),
                content: 'Credit scan note',
                activityData: JSON.stringify({ docGroup: 'CREDIT_REPORT', runBy: { name: 'Someone Else' } }),
                user: { firstName: 'Someone', lastName: 'Else', email: 'else@zenowethu.co.za' },
            },
            {
                id: 'scan-idpoa',
                createdAt: new Date('2026-07-23T09:00:00.000Z'),
                content: 'ID/POA scan note',
                activityData: JSON.stringify({
                    docGroup: 'ID_POA',
                    runBy: { name: 'Thabo Molefe', email: 'thabo@zenowethu.co.za' },
                    mailboxes: [{ id: 'mbx-1', emailAddress: 'transfers@zenowethu.co.za' }],
                    foldersScanned: ['INBOX', 'Sent'],
                    scannedInbox: true,
                    scannedSent: true,
                    scanSummary: { status: 'COMPLETED', emailsScanned: 5, uploadedDocuments: 1 },
                }),
                user: { firstName: 'Thabo', lastName: 'Molefe', email: 'thabo@zenowethu.co.za' },
            },
        ]);

        const response = await GET(getRequest('ID_POA'), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.found).toBe(true);
        expect(body.activityId).toBe('scan-idpoa');
        expect(body.runByName).toBe('Thabo Molefe');
        expect(body.scannedInbox).toBe(true);
        expect(body.scannedSent).toBe(true);
        expect(body.mailboxes[0].emailAddress).toBe('transfers@zenowethu.co.za');
        expect(body.scanSummary.uploadedDocuments).toBe(1);
    });

    it('returns found:false when no scan exists for the docGroup', async () => {
        db.caseComment.findMany.mockResolvedValue([]);

        const response = await GET(getRequest('ID_POA'), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.found).toBe(false);
    });

    it('rejects unauthenticated and partner callers', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        expect((await GET(getRequest('ID_POA'), params)).status).toBe(401);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'partner-1', userType: 'B2B_PARTNER' } });
        expect((await GET(getRequest('ID_POA'), params)).status).toBe(403);
    });
});
