import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth:         vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    renderBrandedEmail: (content: string) => content,
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewDocument: {
            findFirst:  vi.fn(),
            update:     vi.fn(),
            updateMany: vi.fn(),
            findMany:   vi.fn(),
        },
        case: { findUnique: vi.fn() },
    },
}));

vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('fs',          () => ({ existsSync: vi.fn() }));
vi.mock('@/lib/email-with-attachments', () => ({ sendEmailWithAttachments: vi.fn() }));

import { auth }                      from '@zenowethu/shared-lib';
import { prisma }                    from '@zenowethu/database';
import { existsSync }                from 'fs';
import { readFile }                  from 'fs/promises';
import { sendEmailWithAttachments }  from '@/lib/email-with-attachments';

import { PATCH }  from './[docId]/approve/route';
import { POST as POST_CONSUMER }   from './[docId]/send-consumer/route';
import { POST as POST_CREDITORS }  from './send-creditors/route';

// ── Session fixtures ──────────────────────────────────────────────────────────

const adminSession       = { user: { id: 'u1', isAdmin: true,  isExecutive: false, isSeniorManager: false, role: 'ADMIN' } };
const executiveSession   = { user: { id: 'u2', isAdmin: false, isExecutive: true,  isSeniorManager: false, role: 'EXECUTIVE' } };
const seniorMgrSession   = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: true,  role: 'SENIOR_MANAGER' } };
const memberSession      = { user: { id: 'u4', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MEMBER' } };
const unauthenticated    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ctx(caseId: string, docId?: string) {
    return docId
        ? { params: Promise.resolve({ id: caseId, docId }) }
        : { params: Promise.resolve({ id: caseId }) };
}

function makeReq(method = 'PATCH', body?: unknown) {
    return new Request('http://localhost/test', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body:    body ? JSON.stringify(body) : undefined,
    });
}

const sampleDoc = {
    id:               'doc-1',
    caseId:           'case-1',
    documentType:     'FORM_16',
    status:           'DRAFT',
    fileUrl:          '/uploads/debt-review/case-1/Form16.pdf',
    sentToConsumerAt: null,
    approvedAt:       null,
    approvedById:     null,
    approvedBy:       null,
    sentToCreditors:  false,
    sentToCreditorAt: null,
    emailsSentTo:     null,
};

beforeEach(() => vi.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/cases/[id]/debt-review/[docId]/approve
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /debt-review/[docId]/approve', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated as plain MEMBER', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(403);
    });

    it('returns 404 when document not found', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(null);
        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(404);
    });

    it('returns 422 when document has no fileUrl', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue({ ...sampleDoc, fileUrl: null } as any);
        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(422);
    });

    it('returns 409 when document is already APPROVED', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue({ ...sampleDoc, status: 'APPROVED' } as any);
        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(409);
    });

    it('approves document successfully as ADMIN', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        const approvedDoc = { ...sampleDoc, status: 'APPROVED', approvedById: 'u1', approvedBy: { id: 'u1', firstName: 'Admin', lastName: 'User' } };
        vi.mocked(prisma.debtReviewDocument.update).mockResolvedValue(approvedDoc as any);

        const res  = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.document.status).toBe('APPROVED');
    });

    it('approves document successfully as SENIOR_MANAGER', async () => {
        vi.mocked(auth).mockResolvedValue(seniorMgrSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        vi.mocked(prisma.debtReviewDocument.update).mockResolvedValue({ ...sampleDoc, status: 'APPROVED' } as any);

        const res = await PATCH(makeReq(), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cases/[id]/debt-review/[docId]/send-consumer
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /debt-review/[docId]/send-consumer', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(401);
    });

    it('returns 404 when document not found', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(null);
        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(404);
    });

    it('returns 422 when document has no fileUrl', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue({ ...sampleDoc, fileUrl: null } as any);
        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(422);
    });

    it('returns 422 when consumer has no email', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            fileNumber: 'ZW-001',
            client:     { firstName: 'John', lastName: 'Doe', email: null },
        } as any);
        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(422);
    });

    it('returns 422 when PDF file is missing on disk', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            fileNumber: 'ZW-001',
            client:     { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        } as any);
        vi.mocked(existsSync).mockReturnValue(false);
        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(422);
    });

    it('sends email and updates document status', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            fileNumber: 'ZW-001',
            client:     { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        } as any);
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf-content') as any);
        vi.mocked(sendEmailWithAttachments).mockResolvedValue({ success: true, messageId: 'msg-1' });
        vi.mocked(prisma.debtReviewDocument.update).mockResolvedValue({
            ...sampleDoc, status: 'SENT_FOR_SIGNING', sentToConsumerAt: new Date()
        } as any);

        const res  = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.sentTo).toBe('john@example.com');
    });

    it('returns 502 when email delivery fails', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.debtReviewDocument.findFirst).mockResolvedValue(sampleDoc as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            fileNumber: 'ZW-001',
            client:     { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        } as any);
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf') as any);
        vi.mocked(sendEmailWithAttachments).mockResolvedValue({ success: false, error: 'SMTP error' });

        const res = await POST_CONSUMER(makeReq('POST'), ctx('case-1', 'doc-1') as any);
        expect(res.status).toBe(502);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/cases/[id]/debt-review/send-creditors
// ══════════════════════════════════════════════════════════════════════════════

const sampleCaseWithProviders = {
    fileNumber: 'ZW-001',
    client:     { firstName: 'John', lastName: 'Doe' },
    creditAccounts: [
        { id: 'acc-1', creditorName: 'FNB', creditProvider: { id: 'cp-1', name: 'FNB', email: 'fnb@bank.com' } },
        { id: 'acc-2', creditorName: 'ABSA', creditProvider: { id: 'cp-2', name: 'ABSA', email: 'absa@bank.com' } },
    ],
};

const approvedDocs = [
    { ...sampleDoc, id: 'doc-1', status: 'APPROVED', documentType: 'FORM_17_1', fileUrl: '/uploads/debt-review/case-1/Form17.pdf' },
];

describe('POST /debt-review/send-creditors', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        expect(res.status).toBe(401);
    });

    it('returns 422 when credit providers have missing emails', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            ...sampleCaseWithProviders,
            creditAccounts: [
                { id: 'acc-1', creditorName: 'FNB', creditProvider: null },
            ],
        } as any);

        const res = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.missingEmails).toBeDefined();
    });

    it('returns 422 when no approved documents exist', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(sampleCaseWithProviders as any);
        vi.mocked(prisma.debtReviewDocument.findMany).mockResolvedValue([]);

        const res = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        expect(res.status).toBe(422);
    });

    it('returns 404 when case not found', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null);

        const res = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        expect(res.status).toBe(404);
    });

    it('sends emails to all creditors and marks docs as SENT_TO_CREDITORS', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(sampleCaseWithProviders as any);
        vi.mocked(prisma.debtReviewDocument.findMany).mockResolvedValue(approvedDocs as any);
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf') as any);
        vi.mocked(sendEmailWithAttachments).mockResolvedValue({ success: true, messageId: 'msg-x' });
        vi.mocked(prisma.debtReviewDocument.updateMany).mockResolvedValue({ count: 1 } as any);

        const res  = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.sentTo).toContain('fnb@bank.com');
        expect(json.sentTo).toContain('absa@bank.com');
        expect(prisma.debtReviewDocument.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'SENT_TO_CREDITORS' }) })
        );
    });

    it('returns 502 when all email deliveries fail', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(sampleCaseWithProviders as any);
        vi.mocked(prisma.debtReviewDocument.findMany).mockResolvedValue(approvedDocs as any);
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFile).mockResolvedValue(Buffer.from('pdf') as any);
        vi.mocked(sendEmailWithAttachments).mockResolvedValue({ success: false, error: 'SMTP down' });

        const res = await POST_CREDITORS(makeReq('POST', {}), ctx('case-1') as any);
        expect(res.status).toBe(502);
    });
});
