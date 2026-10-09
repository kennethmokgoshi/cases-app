import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        document: { findFirst: vi.fn() },
        workflowLog: { findFirst: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));
vi.mock('../logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('../automation/automation-user', () => ({ getAutomationUserId: vi.fn().mockResolvedValue('auto-user') }));
vi.mock('./legal-fee-document', () => ({ generateLegalFeeInvoiceDocument: vi.fn() }));
vi.mock('./fee-document-service', () => ({ sendFeeDocument: vi.fn() }));

import { autoIssueLegalFeeInvoice } from './legal-fee-auto';
import { prisma } from '@zenowethu/database';
import { generateLegalFeeInvoiceDocument } from './legal-fee-document';
import { sendFeeDocument } from './fee-document-service';

const mockCase = vi.mocked(prisma.case.findUnique);
const mockDoc = vi.mocked(prisma.document.findFirst);
const mockGenerate = vi.mocked(generateLegalFeeInvoiceDocument);
const mockSend = vi.mocked(sendFeeDocument);

const caseRow = (over: Record<string, unknown> = {}) => ({
    id: 'case-1',
    consumerDhsStatus: 'D4',
    dhsStatus: null,
    legalFeesStatus: null,
    client: { email: 'client@example.test' },
    ...over,
});

describe('autoIssueLegalFeeInvoice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCase.mockResolvedValue(caseRow() as never);
        vi.mocked(prisma.case.update).mockResolvedValue({} as never);
        vi.mocked(prisma.caseComment.create).mockResolvedValue({} as never);
        mockDoc.mockResolvedValue(null as never);
        mockGenerate.mockResolvedValue({
            ok: true, invoiceId: 'inv-1', invoiceNumber: 'INV-0001', total: 1700,
            documentId: 'doc-1', statusChange: { moved: false }, portalPublished: true,
        } as never);
        mockSend.mockResolvedValue({ ok: true, recipient: 'client@example.test', statusChange: { moved: false } } as never);
    });

    it('creates, publishes and emails the R1,700 invoice for an accepted D4 file without moving the workflow status', async () => {
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1', userId: 'staff-1' });

        expect(result).toMatchObject({ action: 'INVOICED', invoiceNumber: 'INV-0001', emailSent: true, portalPublished: true });
        expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
            caseId: 'case-1', userId: 'staff-1', moveStatus: false, autoIssued: true,
        }));
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1', moveStatus: false }));
        expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { legalFeesStatus: 'No Arrangement yet' } });
    });

    it('also invoices D3 and falls back to the automation user when no staff member is given', async () => {
        mockCase.mockResolvedValue(caseRow({ consumerDhsStatus: 'D3 - Debt review with court order' }) as never);
        await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ userId: 'auto-user' }));
    });

    it('never invoices a payroll (PR Fees Consent) file', async () => {
        mockCase.mockResolvedValue(caseRow({ legalFeesStatus: 'PR Fees Consent' }) as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result.action).toBe('SKIPPED');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('records "No Legal Fees" for A and C files and creates no invoice', async () => {
        mockCase.mockResolvedValue(caseRow({ consumerDhsStatus: 'A' }) as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result.action).toBe('NO_LEGAL_FEES');
        expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { legalFeesStatus: 'No Legal Fees' } });
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('does nothing while the consumer DHS code is unknown', async () => {
        mockCase.mockResolvedValue(caseRow({ consumerDhsStatus: null }) as never);
        expect((await autoIssueLegalFeeInvoice({ caseId: 'case-1' })).action).toBe('SKIPPED');
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('is idempotent — a staff-created invoice is left alone', async () => {
        mockDoc.mockResolvedValue({ id: 'doc-0', extractedData: JSON.stringify({ feeInvoiceId: 'inv-0' }) } as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result.action).toBe('SKIPPED');
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('is idempotent — an automatic invoice that was already sent is not sent again', async () => {
        mockDoc.mockResolvedValue({ id: 'doc-0', extractedData: JSON.stringify({ feeInvoiceId: 'inv-0', autoIssued: true }) } as never);
        vi.mocked(prisma.workflowLog.findFirst).mockResolvedValue({ id: 'log-1' } as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result.action).toBe('SKIPPED');
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('re-sends an automatic invoice that never went out', async () => {
        mockDoc.mockResolvedValue({ id: 'doc-0', extractedData: JSON.stringify({ feeInvoiceId: 'inv-0', autoIssued: true }) } as never);
        vi.mocked(prisma.workflowLog.findFirst).mockResolvedValue(null as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result).toMatchObject({ action: 'RESENT', emailSent: true });
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-0', moveStatus: false }));
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('creates the invoice but reports it unsent when the consumer has no email', async () => {
        mockCase.mockResolvedValue(caseRow({ client: { email: null } }) as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result).toMatchObject({ action: 'INVOICED', emailSent: false });
        expect(result.errors[0]).toMatch(/no consumer email/);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('reports a send failure without throwing', async () => {
        mockSend.mockResolvedValue({ ok: false, failure: 'SEND_FAILED', error: 'SMTP down' } as never);
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result).toMatchObject({ action: 'INVOICED', emailSent: false, errors: ['SMTP down'] });
    });

    it('reports a generation failure (e.g. no default bank account) and never throws', async () => {
        mockGenerate.mockResolvedValue({ ok: false, status: 500, error: 'No default banking details found.' });
        const result = await autoIssueLegalFeeInvoice({ caseId: 'case-1' });
        expect(result).toMatchObject({ action: 'SKIPPED', errors: ['No default banking details found.'] });

        mockCase.mockRejectedValue(new Error('db down'));
        expect((await autoIssueLegalFeeInvoice({ caseId: 'case-1' })).errors).toEqual(['db down']);
    });
});
