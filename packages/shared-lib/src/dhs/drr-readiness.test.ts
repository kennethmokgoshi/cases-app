import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        document: { create: vi.fn() },
        caseComment: { findFirst: vi.fn(), create: vi.fn() },
        consumerAccount: { findUnique: vi.fn() },
        documentRequest: { findFirst: vi.fn(), create: vi.fn() },
    },
}));

vi.mock('../notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

vi.mock('../openai/pdf-process', () => ({
    identifyDocumentPages: vi.fn(),
    splitPdf: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    readFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
    existsSync: vi.fn(() => true),
}));

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import { identifyDocumentPages, splitPdf } from '../openai/pdf-process';
import { runDrrDocumentReadiness, docTypeToKind, resolveDocumentFilePath } from './drr-readiness';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    document: { create: ReturnType<typeof vi.fn> };
    caseComment: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
    documentRequest: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};
const sendMsg = sendManualMessage as unknown as ReturnType<typeof vi.fn>;
const identify = identifyDocumentPages as unknown as ReturnType<typeof vi.fn>;
const split = splitPdf as unknown as ReturnType<typeof vi.fn>;

const doc = (type: string, overrides: Record<string, unknown> = {}) => ({
    id: `doc-${type.toLowerCase()}`,
    type,
    fileName: `${type.toLowerCase()}.pdf`,
    fileUrl: `/uploads/case1/${type.toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    uploadedAt: new Date(),
    ...overrides,
});

const baseCase = (documents: unknown[], overrides: Record<string, unknown> = {}) => ({
    id: 'case1',
    clientId: 'cl1',
    fileNumber: 'ZDM-2026-001',
    client: { firstName: 'Sipho', lastName: 'Dlamini', idNumber: '8001015009087' },
    documents,
    referrer: null,
    projects: [],
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    db.caseComment.findFirst.mockResolvedValue(null);
    db.caseComment.create.mockResolvedValue({});
    db.consumerAccount.findUnique.mockResolvedValue({ id: 'cons1' });
    db.documentRequest.findFirst.mockResolvedValue(null);
    db.documentRequest.create.mockResolvedValue({});
    sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });
});

describe('docTypeToKind', () => {
    it('maps credit report variants, payslip and bank statement', () => {
        expect(docTypeToKind('CREDIT_REPORT')).toBe('CREDIT_REPORT');
        expect(docTypeToKind('CREDIT_REPORT_OTHER')).toBe('CREDIT_REPORT');
        expect(docTypeToKind('PAYSLIP')).toBe('PAYSLIP');
        expect(docTypeToKind('BANK_STATEMENT')).toBe('BANK_STATEMENT');
        expect(docTypeToKind('ID')).toBeNull();
        expect(docTypeToKind('COMBINED')).toBeNull();
    });
});

describe('resolveDocumentFilePath', () => {
    it('maps /uploads/ URLs into storage/uploads', () => {
        const p = resolveDocumentFilePath('/uploads/case1/a.pdf', '/srv/app');
        expect(p.replace(/\\/g, '/')).toBe('/srv/app/storage/uploads/case1/a.pdf');
    });

    it('maps other URLs into public/', () => {
        const p = resolveDocumentFilePath('/docs/a.pdf', '/srv/app');
        expect(p.replace(/\\/g, '/')).toBe('/srv/app/public/docs/a.pdf');
    });
});

describe('runDrrDocumentReadiness', () => {
    it('reports READY (click Manage Consumers) when all three documents are on file', async () => {
        db.case.findUnique.mockResolvedValue(
            baseCase([doc('CREDIT_REPORT'), doc('PAYSLIP'), doc('BANK_STATEMENT')]),
        );

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.ready).toBe(true);
        expect(r.missingAfter).toEqual([]);
        expect(r.splitAttempted).toBe(false);
        expect(identify).not.toHaveBeenCalled();
        expect(sendMsg).not.toHaveBeenCalled();
        const readyComment = db.caseComment.create.mock.calls.find(
            (c) => c[0].data.activityType === 'DRR_READY_FOR_MANAGE_CONSUMERS',
        );
        expect(readyComment).toBeTruthy();
        expect(readyComment?.[0].data.content).toContain('Manage Consumers');
    });

    it('splits the combined document to recover missing documents, and opens a Credo request for what remains', async () => {
        db.case.findUnique.mockResolvedValue(baseCase([doc('COMBINED'), doc('BANK_STATEMENT')]));
        // AI finds credit report + payslip inside the combined PDF
        identify.mockResolvedValue({
            documents: [
                { type: 'ID', startPage: 1, endPage: 1, confidence: 0.99, description: 'SA ID' },
                { type: 'CREDIT_REPORT', startPage: 2, endPage: 8, confidence: 0.95, description: 'XDS report' },
                { type: 'PAYSLIP', startPage: 9, endPage: 9, confidence: 0.9, description: 'Payslip' },
            ],
            totalPages: 9,
        });
        split.mockResolvedValue([
            { type: 'CREDIT_REPORT', base64Pdf: 'YQ==', pageCount: 7 },
            { type: 'PAYSLIP', base64Pdf: 'Yg==', pageCount: 1 },
        ]);
        db.document.create
            .mockResolvedValueOnce(doc('CREDIT_REPORT', { id: 'new-cr' }))
            .mockResolvedValueOnce(doc('PAYSLIP', { id: 'new-ps' }));

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.splitAttempted).toBe(true);
        // Only the MISSING kinds were split out — the ID segment was ignored
        const splitRanges = split.mock.calls[0][1];
        expect(splitRanges.map((s: { type: string }) => s.type)).toEqual(['CREDIT_REPORT', 'PAYSLIP']);
        expect(r.recoveredBySplit).toEqual(expect.arrayContaining(['CREDIT_REPORT', 'PAYSLIP']));
        expect(r.ready).toBe(true);
        expect(db.document.create).toHaveBeenCalledTimes(2);
    });

    it('requests the credit report from the referrer when it cannot be recovered by splitting', async () => {
        db.case.findUnique.mockResolvedValue(
            baseCase([doc('PAYSLIP'), doc('BANK_STATEMENT')], {
                referrer: { firstName: 'Lebo', lastName: 'M', email: 'lebo@partner.co.za' },
            }),
        );

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.ready).toBe(false);
        expect(r.missingAfter).toEqual(['CREDIT_REPORT']);
        expect(r.creditReportRequestedFrom).toBe('lebo@partner.co.za');
        const [caseId, channel, recipient, body, subject] = sendMsg.mock.calls[0];
        expect(caseId).toBe('case1');
        expect(channel).toBe('EMAIL');
        expect(recipient).toBe('lebo@partner.co.za');
        expect(body).toContain('Sipho Dlamini');
        expect(subject).toContain('Credit report needed');
        const reqComment = db.caseComment.create.mock.calls.find(
            (c) => c[0].data.activityType === 'DRR_CREDIT_REPORT_REQUESTED',
        );
        expect(reqComment).toBeTruthy();
    });

    it('falls back to the B2B partner project billing email when there is no referrer', async () => {
        db.case.findUnique.mockResolvedValue(
            baseCase([doc('PAYSLIP'), doc('BANK_STATEMENT')], {
                projects: [{ project: { name: 'Letsatsi Finance', billingEmail: 'accounts@letsatsi.co.za' } }],
            }),
        );

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.creditReportRequestedFrom).toBe('accounts@letsatsi.co.za');
    });

    it('escalates to staff when the credit report is missing and nobody can be asked', async () => {
        db.case.findUnique.mockResolvedValue(baseCase([doc('PAYSLIP'), doc('BANK_STATEMENT')]));

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.ready).toBe(false);
        expect(r.creditReportRequestedFrom).toBeNull();
        expect(sendMsg).not.toHaveBeenCalled();
        expect(r.errors.join(' ')).toContain('no referrer/B2B partner email');
        const escalation = db.caseComment.create.mock.calls.find(
            (c) => c[0].data.activityType === 'DRR_CREDIT_REPORT_MISSING',
        );
        expect(escalation).toBeTruthy();
    });

    it('does not re-email the referrer within the cooldown window', async () => {
        db.case.findUnique.mockResolvedValue(
            baseCase([doc('PAYSLIP'), doc('BANK_STATEMENT')], {
                referrer: { firstName: 'Lebo', lastName: 'M', email: 'lebo@partner.co.za' },
            }),
        );
        db.caseComment.findFirst.mockResolvedValue({ id: 'recent' }); // recent request exists

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(sendMsg).not.toHaveBeenCalled();
        expect(r.creditReportRequestedFrom).toBeNull();
    });

    it('opens Credo DocumentRequests for missing payslip/bank statement without duplicating open ones', async () => {
        db.case.findUnique.mockResolvedValue(
            baseCase([doc('CREDIT_REPORT')]),
        );
        // Payslip request already open; bank statement not yet
        db.documentRequest.findFirst
            .mockResolvedValueOnce({ id: 'open-payslip' })
            .mockResolvedValueOnce(null);

        const r = await runDrrDocumentReadiness({ caseId: 'case1' });

        expect(r.ready).toBe(false);
        expect(db.documentRequest.create).toHaveBeenCalledTimes(1);
        expect(r.documentRequestsCreated).toEqual(["Latest 3 months' bank statements"]);
    });

    it('never throws — a missing case is reported as an error', async () => {
        db.case.findUnique.mockResolvedValue(null);
        const r = await runDrrDocumentReadiness({ caseId: 'missing' });
        expect(r.errors).toContain('Case not found');
        expect(r.ready).toBe(false);
    });
});
