import { describe, it, expect, vi, beforeEach } from 'vitest';

const documentFindFirst = vi.fn();
const documentFindMany = vi.fn();
const caseFindUnique = vi.fn();
const workflowLogCreate = vi.fn();
const workflowLogFindMany = vi.fn();
const paymentCreate = vi.fn();
const paymentFindMany = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceUpdate = vi.fn();

vi.mock('@zenowethu/database', () => {
    const tx = {
        payment: { create: (...a: unknown[]) => paymentCreate(...a) },
        invoice: { findUnique: (...a: unknown[]) => invoiceFindUnique(...a), update: (...a: unknown[]) => invoiceUpdate(...a) },
    };
    return {
        Prisma: { Decimal: class { constructor(public value: number) {} } },
        prisma: {
            document: { findFirst: (...a: unknown[]) => documentFindFirst(...a), findMany: (...a: unknown[]) => documentFindMany(...a) },
            case: { findUnique: (...a: unknown[]) => caseFindUnique(...a) },
            workflowLog: { create: (...a: unknown[]) => workflowLogCreate(...a), findMany: (...a: unknown[]) => workflowLogFindMany(...a) },
            payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
            $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
        },
    };
});

const sendManualMessage = vi.fn();
vi.mock('../notifications/service', () => ({ sendManualMessage: (...a: unknown[]) => sendManualMessage(...a) }));

const resolveMandateAttachments = vi.fn();
vi.mock('../documents/mandate-attachments', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../documents/mandate-attachments')>();
    return {
        ...actual,
        mandateBaseUrl: () => 'https://cases.test',
        resolveMandateAttachments: (...a: unknown[]) => resolveMandateAttachments(...a),
    };
});

vi.mock('../company/company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('../company/profile');
    return { getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE) };
});

const applyFeeDocumentStatus = vi.fn();
vi.mock('./fee-document-status', () => ({
    applyFeeDocumentStatus: (...a: unknown[]) => applyFeeDocumentStatus(...a),
    feeDocumentLogTag: (id: string) => `[doc:${id}]`,
}));

import {
    sendFeeDocument,
    markFeeDocumentPaid,
    getFeeDocumentHistory,
    readFeeDocumentMeta,
    MarkFeePaidSchema,
} from './fee-document-service';

const baseCase = {
    id: 'case-1',
    status: 'POP_RECEIVED',
    clientId: 'client-1',
    fileNumber: 'ZDM-001',
    debtCounsellorName: 'Jane DC',
    preferredDcEmail: 'jane@dc.test',
    client: { firstName: 'John', lastName: 'Dlamini', idNumber: '8001015009087', email: 'john@consumer.test' },
    debtCounsellor: null,
};

const doc = (type: string, extra: Record<string, unknown> = {}) => ({
    id: 'doc-1', type, fileName: 'file.pdf', fileUrl: '/uploads/case-1/file.pdf',
    verificationStatus: 'NOT_CHECKED', extractedData: null, ...extra,
});

describe('sendFeeDocument', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        caseFindUnique.mockResolvedValue(baseCase);
        resolveMandateAttachments.mockResolvedValue({
            attachments: ['https://cases.test/uploads/case-1/poa.pdf', 'https://cases.test/uploads/case-1/id.pdf'],
            poa: { type: 'POA' }, id: { type: 'ID' }, missing: [], complete: true,
            summary: 'signed POA + ID copy attached',
        });
        sendManualMessage.mockResolvedValue({ emailSuccess: true, errors: [] });
        applyFeeDocumentStatus.mockResolvedValue({ moved: true, toStatus: 'POP_SENT_TO_DC' });
    });

    it('forwards proof of payment to the DC with the POA and ID attached', async () => {
        documentFindFirst.mockResolvedValue(doc('PROOF_OF_PAYMENT'));

        const result = await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' });

        expect(result).toMatchObject({ ok: true, recipient: 'jane@dc.test', statusChange: { moved: true } });
        const [, channel, recipient, body, , options] = sendManualMessage.mock.calls[0];
        expect(channel).toBe('EMAIL');
        expect(recipient).toBe('jane@dc.test');
        expect(options.attachments).toEqual([
            'https://cases.test/uploads/case-1/file.pdf',
            'https://cases.test/uploads/case-1/poa.pdf',
            'https://cases.test/uploads/case-1/id.pdf',
        ]);
        expect(body).toContain('proof of our authority');
        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({
            docType: 'PROOF_OF_PAYMENT', event: 'SENT', documentId: 'doc-1', recordWhenUnchanged: true,
        }));
    });

    it('sends the DC invoice to the consumer without the mandate', async () => {
        documentFindFirst.mockResolvedValue(doc('DC_INVOICE_RECEIVED'));

        const result = await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' });

        expect(result).toMatchObject({ ok: true, recipient: 'john@consumer.test' });
        expect(resolveMandateAttachments).not.toHaveBeenCalled();
        expect(sendManualMessage.mock.calls[0][5].attachments).toEqual(['https://cases.test/uploads/case-1/file.pdf']);
    });

    it('does not change status when the email fails', async () => {
        documentFindFirst.mockResolvedValue(doc('LEGAL_FEE_INVOICE'));
        sendManualMessage.mockResolvedValue({ emailSuccess: false, errors: ['SMTP down'] });

        const result = await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' });

        expect(result).toMatchObject({ ok: false, failure: 'SEND_FAILED' });
        expect(applyFeeDocumentStatus).not.toHaveBeenCalled();
    });

    it('does not change status when an attachment failed, but logs it', async () => {
        documentFindFirst.mockResolvedValue(doc('PROOF_OF_PAYMENT'));
        sendManualMessage.mockResolvedValue({ emailSuccess: true, errors: [], attachmentErrors: ['file.pdf: 404'] });
        workflowLogCreate.mockResolvedValue({});

        const result = await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' });

        expect(result).toMatchObject({ ok: false, failure: 'ATTACHMENT_FAILED' });
        expect(applyFeeDocumentStatus).not.toHaveBeenCalled();
        expect(workflowLogCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ action: 'FEE_DOCUMENT_SEND_INCOMPLETE', toStatus: 'POP_RECEIVED' }),
        });
    });

    it('refuses without a recipient address', async () => {
        documentFindFirst.mockResolvedValue(doc('INVOICE_TO_DC'));
        caseFindUnique.mockResolvedValue({ ...baseCase, preferredDcEmail: null });

        const result = await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' });

        expect(result).toMatchObject({ ok: false, failure: 'NO_RECIPIENT' });
        expect(sendManualMessage).not.toHaveBeenCalled();
    });

    it('refuses a document tied to a different consumer, or a non-fee document', async () => {
        documentFindFirst.mockResolvedValueOnce(doc('PROOF_OF_PAYMENT', { verificationStatus: 'MISMATCH' }));
        expect(await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' }))
            .toMatchObject({ ok: false, failure: 'DOCUMENT_UNTRUSTED' });

        documentFindFirst.mockResolvedValueOnce(doc('ID'));
        expect(await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' }))
            .toMatchObject({ ok: false, failure: 'NOT_FEE_DOCUMENT' });

        documentFindFirst.mockResolvedValueOnce(null);
        expect(await sendFeeDocument({ caseId: 'case-1', documentId: 'doc-1', userId: 'u1' }))
            .toMatchObject({ ok: false, failure: 'DOCUMENT_NOT_FOUND' });
        expect(sendManualMessage).not.toHaveBeenCalled();
    });
});

describe('markFeeDocumentPaid', () => {
    const input = MarkFeePaidSchema.parse({ amount: 1700, paidAt: '2026-09-20', method: 'EFT', reference: 'ABC' });

    beforeEach(() => {
        vi.clearAllMocks();
        caseFindUnique.mockResolvedValue({ clientId: 'client-1' });
        paymentCreate.mockResolvedValue({ id: 'pay-1' });
        applyFeeDocumentStatus.mockResolvedValue({ moved: true, toStatus: 'LEGAL_FEE_PAID' });
    });

    it('records a legal fee payment, settles the linked invoice and moves the status', async () => {
        documentFindFirst.mockResolvedValue(doc('LEGAL_FEE_INVOICE', { extractedData: JSON.stringify({ feeInvoiceId: 'inv-1' }) }));
        invoiceFindUnique.mockResolvedValue({ total: 1700, payments: [{ amount: 1700 }] });

        const result = await markFeeDocumentPaid({ caseId: 'case-1', documentId: 'doc-1', input, userId: 'u1' });

        expect(result).toMatchObject({ ok: true, paymentId: 'pay-1' });
        expect(paymentCreate.mock.calls[0][0].data).toMatchObject({
            category: 'LEGAL_FEE', status: 'COMPLETED', caseId: 'case-1', clientId: 'client-1', invoiceId: 'inv-1',
            notes: expect.stringMatching(/^\[doc:doc-1\]/),
        });
        expect(invoiceUpdate).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PAID' } });
        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ event: 'PAID', docType: 'LEGAL_FEE_INVOICE' }));
    });

    it('marks a part-paid invoice as PARTIALLY_PAID', async () => {
        documentFindFirst.mockResolvedValue(doc('LEGAL_FEE_INVOICE', { extractedData: JSON.stringify({ feeInvoiceId: 'inv-1' }) }));
        invoiceFindUnique.mockResolvedValue({ total: 1700, payments: [{ amount: 500 }] });

        await markFeeDocumentPaid({ caseId: 'case-1', documentId: 'doc-1', input: { ...input, amount: 500 }, userId: 'u1' });

        expect(invoiceUpdate).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PARTIALLY_PAID' } });
    });

    it('records a DC fee payment on an uploaded invoice with no linked Invoice row', async () => {
        documentFindFirst.mockResolvedValue(doc('INVOICE_TO_DC'));

        const result = await markFeeDocumentPaid({ caseId: 'case-1', documentId: 'doc-1', input, userId: 'u1' });

        expect(result.ok).toBe(true);
        expect(paymentCreate.mock.calls[0][0].data).toMatchObject({ category: 'DC_FEE_RECOVERY', invoiceId: null });
        expect(invoiceUpdate).not.toHaveBeenCalled();
    });

    it('refuses to record payment against a DC invoice or proof of payment', async () => {
        documentFindFirst.mockResolvedValue(doc('PROOF_OF_PAYMENT'));
        const result = await markFeeDocumentPaid({ caseId: 'case-1', documentId: 'doc-1', input, userId: 'u1' });
        expect(result).toMatchObject({ ok: false, failure: 'NOT_PAYABLE' });
        expect(paymentCreate).not.toHaveBeenCalled();
    });

    it('rejects a zero amount at the schema', () => {
        expect(MarkFeePaidSchema.safeParse({ amount: 0, paidAt: '2026-09-20' }).success).toBe(false);
    });
});

describe('getFeeDocumentHistory', () => {
    it('reads the last send and the total paid per document', async () => {
        documentFindMany.mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]);
        workflowLogFindMany.mockResolvedValue([
            { notes: '[doc:doc-1] Send to DC: emailed file.pdf to jane@dc.test', timestamp: new Date('2026-09-21T10:00:00Z') },
        ]);
        paymentFindMany.mockResolvedValue([
            { notes: '[doc:doc-2] Paid by consumer', amount: 1000, date: new Date('2026-09-22') },
            { notes: '[doc:doc-2] Paid by consumer', amount: 700, date: new Date('2026-09-23') },
        ]);

        const history = await getFeeDocumentHistory('case-1');

        expect(history[0]).toMatchObject({ documentId: 'doc-1', lastSentAt: '2026-09-21T10:00:00.000Z', paidAmount: 0 });
        expect(history[0].lastSentNote).toBe('Send to DC: emailed file.pdf to jane@dc.test');
        expect(history[1]).toMatchObject({ documentId: 'doc-2', lastSentAt: null, paidAmount: 1700 });
        expect(history[1].lastPaidAt).toBe(new Date('2026-09-23').toISOString());
    });
});

describe('readFeeDocumentMeta', () => {
    it('reads the invoice link and ignores anything else', () => {
        expect(readFeeDocumentMeta(JSON.stringify({ feeInvoiceId: 'inv-1' }))).toEqual({ feeInvoiceId: 'inv-1' });
        expect(readFeeDocumentMeta('{"idNumber":"123"}')).toEqual({});
        expect(readFeeDocumentMeta('not json')).toEqual({});
        expect(readFeeDocumentMeta(null)).toEqual({});
    });
});
