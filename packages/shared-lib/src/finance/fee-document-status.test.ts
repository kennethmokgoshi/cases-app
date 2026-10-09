import { describe, it, expect, vi, beforeEach } from 'vitest';

const caseFindUnique = vi.fn();
const caseUpdate = vi.fn();
const workflowLogCreate = vi.fn();
const invoiceFindUnique = vi.fn();
const documentFindFirst = vi.fn();
const inAppCreateMany = vi.fn();
const userFindMany = vi.fn();

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: (...a: unknown[]) => caseFindUnique(...a), update: (...a: unknown[]) => caseUpdate(...a) },
        workflowLog: { create: (...a: unknown[]) => workflowLogCreate(...a) },
        invoice: { findUnique: (...a: unknown[]) => invoiceFindUnique(...a) },
        document: { findFirst: (...a: unknown[]) => documentFindFirst(...a) },
        inAppNotification: { createMany: (...a: unknown[]) => inAppCreateMany(...a) },
        user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    },
}));

import { applyFeeDocumentStatus, feeDocumentLogTag, syncFeeInvoicePaidStatus } from './fee-document-status';

describe('applyFeeDocumentStatus', () => {
    beforeEach(() => vi.clearAllMocks());

    it('moves the case, resets SLA counters and writes a tagged workflow log', async () => {
        caseFindUnique.mockResolvedValue({ status: 'INVOICE_SENT_CONSUMER' });

        const result = await applyFeeDocumentStatus({
            caseId: 'case-1', docType: 'PROOF_OF_PAYMENT', event: 'UPLOADED', userId: 'u1',
            documentId: 'doc-1', notes: 'Uploaded pop.pdf',
        });

        expect(result).toEqual({ moved: true, fromStatus: 'INVOICE_SENT_CONSUMER', toStatus: 'POP_RECEIVED' });
        const { data } = caseUpdate.mock.calls[0][0];
        expect(data.status).toBe('POP_RECEIVED');
        expect(data.daysInStatus).toBe(0);
        expect(data.isOverdue).toBe(false);
        expect(data.nextUpdate).toBeInstanceOf(Date);
        expect(data.workflowLogs.create).toMatchObject({
            fromStatus: 'INVOICE_SENT_CONSUMER',
            toStatus: 'POP_RECEIVED',
            action: 'FEE_DOCUMENT_UPLOADED',
            notes: `${feeDocumentLogTag('doc-1')} Uploaded pop.pdf`,
        });
        expect(workflowLogCreate).not.toHaveBeenCalled();
    });

    it('does not move a finished case, but records the send when asked', async () => {
        caseFindUnique.mockResolvedValue({ status: 'COMPLETED' });

        const result = await applyFeeDocumentStatus({
            caseId: 'case-1', docType: 'PROOF_OF_PAYMENT', event: 'SENT', documentId: 'doc-1', recordWhenUnchanged: true,
        });

        expect(result.moved).toBe(false);
        expect(result.message).toMatch(/completed/i);
        expect(caseUpdate).not.toHaveBeenCalled();
        expect(workflowLogCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ fromStatus: 'COMPLETED', toStatus: 'COMPLETED', action: 'FEE_DOCUMENT_SENT' }),
        });
    });

    it('does not write a log for an unchanged upload', async () => {
        caseFindUnique.mockResolvedValue({ status: 'POP_SENT_TO_DC' });
        const result = await applyFeeDocumentStatus({ caseId: 'case-1', docType: 'PROOF_OF_PAYMENT', event: 'UPLOADED' });
        expect(result.moved).toBe(false);
        expect(workflowLogCreate).not.toHaveBeenCalled();
    });

    it('does nothing for a missing case', async () => {
        caseFindUnique.mockResolvedValue(null);
        const result = await applyFeeDocumentStatus({ caseId: 'x', docType: 'PROOF_OF_PAYMENT', event: 'UPLOADED' });
        expect(result).toEqual({ moved: false, message: 'Case not found' });
        expect(caseUpdate).not.toHaveBeenCalled();
    });
});

describe('DC fee paid → staff alert', () => {
    beforeEach(() => vi.clearAllMocks());

    const alertCase = (overrides: Record<string, unknown> = {}) => ({
        fileNumber: 'ZDM-001', assignedToId: 'staff-1', debtCounsellorName: 'Jane DC',
        client: { firstName: 'John', lastName: 'Dlamini' },
        projects: [{ project: { members: [{ userId: 'mgr-1' }] } }],
        ...overrides,
    });

    it('alerts the assignee and project managers to accept the DHS transfer', async () => {
        caseFindUnique
            .mockResolvedValueOnce({ status: 'DC_FEE_INVOICE_SENT' })
            .mockResolvedValueOnce(alertCase());

        await applyFeeDocumentStatus({ caseId: 'case-1', docType: 'INVOICE_TO_DC', event: 'PAID', userId: 'u1' });

        const { data } = inAppCreateMany.mock.calls[0][0];
        expect(data.map((d: { userId: string }) => d.userId).sort()).toEqual(['mgr-1', 'staff-1']);
        expect(data[0]).toMatchObject({ type: 'DC_FEE_PAID_TRANSFER', caseId: 'case-1', linkUrl: '/cases/case-1' });
        expect(data[0].message).toContain('Accept the transfer on DHS');
        expect(userFindMany).not.toHaveBeenCalled();
    });

    it('falls back to admins when nobody is assigned', async () => {
        caseFindUnique
            .mockResolvedValueOnce({ status: 'DC_FEE_INVOICE_SENT' })
            .mockResolvedValueOnce(alertCase({ assignedToId: null, projects: [] }));
        userFindMany.mockResolvedValue([{ id: 'admin-1' }]);

        await applyFeeDocumentStatus({ caseId: 'case-1', docType: 'INVOICE_TO_DC', event: 'PAID' });

        expect(inAppCreateMany.mock.calls[0][0].data.map((d: { userId: string }) => d.userId)).toEqual(['admin-1']);
    });

    it('a failed alert does not fail the status change', async () => {
        caseFindUnique.mockResolvedValueOnce({ status: 'DC_FEE_INVOICE_SENT' }).mockResolvedValueOnce(alertCase());
        inAppCreateMany.mockRejectedValue(new Error('db down'));

        const result = await applyFeeDocumentStatus({ caseId: 'case-1', docType: 'INVOICE_TO_DC', event: 'PAID' });
        expect(result.moved).toBe(true);
    });

    it('does not alert for other statuses', async () => {
        caseFindUnique.mockResolvedValueOnce({ status: 'LEGAL_FEE_INVOICE_SENT' });
        await applyFeeDocumentStatus({ caseId: 'case-1', docType: 'LEGAL_FEE_INVOICE', event: 'PAID' });
        expect(inAppCreateMany).not.toHaveBeenCalled();
    });
});

describe('syncFeeInvoicePaidStatus', () => {
    beforeEach(() => vi.clearAllMocks());

    it('moves the case when a DC fee invoice is paid in Finance', async () => {
        invoiceFindUnique.mockResolvedValue({ id: 'inv-1', type: 'DC_FEE_INVOICE', status: 'PAID', caseId: 'case-1', invoiceNumber: 'INV-1' });
        caseFindUnique.mockResolvedValueOnce({ status: 'DC_FEE_INVOICE_SENT' }).mockResolvedValueOnce(null);

        const result = await syncFeeInvoicePaidStatus({ invoiceId: 'inv-1', userId: 'u1' });

        expect(result).toMatchObject({ moved: true, toStatus: 'DC_FEE_PAID_READY_TRANSFER' });
    });

    it('moves the case when a generated legal fee invoice is paid', async () => {
        invoiceFindUnique.mockResolvedValue({ id: 'inv-2', type: 'INVOICE', status: 'PAID', caseId: 'case-1', invoiceNumber: 'INV-2' });
        documentFindFirst.mockResolvedValue({ id: 'doc-1' });
        caseFindUnique.mockResolvedValueOnce({ status: 'LEGAL_FEE_INVOICE_SENT' });

        const result = await syncFeeInvoicePaidStatus({ invoiceId: 'inv-2' });

        expect(result).toMatchObject({ moved: true, toStatus: 'LEGAL_FEE_PAID' });
        expect(documentFindFirst.mock.calls[0][0].where.extractedData).toEqual({ contains: '"feeInvoiceId":"inv-2"' });
    });

    it('ignores ordinary invoices, unpaid invoices and invoices with no case', async () => {
        invoiceFindUnique.mockResolvedValueOnce({ id: 'i', type: 'INVOICE', status: 'PAID', caseId: 'case-1', invoiceNumber: 'X' });
        documentFindFirst.mockResolvedValueOnce(null);
        expect(await syncFeeInvoicePaidStatus({ invoiceId: 'i' })).toBeNull();

        invoiceFindUnique.mockResolvedValueOnce({ id: 'i', type: 'DC_FEE_INVOICE', status: 'PARTIALLY_PAID', caseId: 'case-1', invoiceNumber: 'X' });
        expect(await syncFeeInvoicePaidStatus({ invoiceId: 'i' })).toBeNull();

        invoiceFindUnique.mockResolvedValueOnce({ id: 'i', type: 'DC_FEE_INVOICE', status: 'PAID', caseId: null, invoiceNumber: 'X' });
        expect(await syncFeeInvoicePaidStatus({ invoiceId: 'i' })).toBeNull();
        expect(caseUpdate).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
        invoiceFindUnique.mockRejectedValue(new Error('db down'));
        expect(await syncFeeInvoicePaidStatus({ invoiceId: 'i' })).toBeNull();
    });
});
