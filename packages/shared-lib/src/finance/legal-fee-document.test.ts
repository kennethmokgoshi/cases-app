import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        invoice: { findUniqueOrThrow: vi.fn() },
        document: { create: vi.fn() },
        consumerAccount: { findUnique: vi.fn() },
        credoDocument: { findFirst: vi.fn(), create: vi.fn() },
    },
}));
vi.mock('../logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('../company/company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('../company/profile');
    return { getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE) };
});
vi.mock('../crediva/consumer-provisioning', () => ({ provisionConsumerForClient: vi.fn() }));
vi.mock('./banking-details', () => ({
    resolveInvoiceBankingDetails: vi.fn().mockResolvedValue({ bankName: 'Bank', accountHolder: 'Co', accountNumber: '1', branchCode: '2' }),
}));
vi.mock('./fee-document-status', () => ({
    applyFeeDocumentStatus: vi.fn().mockResolvedValue({ moved: false }),
}));
vi.mock('./invoice-pdf', () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
vi.mock('./legal-fee-invoice', () => ({ createLegalFeeInvoice: vi.fn() }));

import { generateLegalFeeInvoiceDocument, publishInvoiceToPortal } from './legal-fee-document';
import { prisma } from '@zenowethu/database';
import { provisionConsumerForClient } from '../crediva/consumer-provisioning';
import { applyFeeDocumentStatus } from './fee-document-status';
import { createLegalFeeInvoice } from './legal-fee-invoice';

const input = { description: 'Legal fees', dueInDays: 7 };

describe('generateLegalFeeInvoiceDocument', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: 'case-1', clientId: 'client-1', client: { idNumber: '8501190682087' } } as never);
        vi.mocked(createLegalFeeInvoice).mockResolvedValue({ ok: true, invoice: { id: 'inv-1' } } as never);
        vi.mocked(prisma.invoice.findUniqueOrThrow).mockResolvedValue({
            id: 'inv-1', invoiceNumber: 'INV-0001', issuedAt: new Date(), dueAt: new Date(), status: 'DRAFT',
            client: { firstName: 'Gloria', lastName: 'Nkanyane', email: 'g@x.test', phone: null, idNumber: '8501190682087' },
            case: { fileNumber: 'ZDM-1' }, lineItems: [{ description: 'Legal fees', quantity: 1, unitPrice: 1700 }],
            subtotal: 1700, vatRate: 0, vatAmount: 0, total: 1700, reference: '8501190682087', createdBy: null,
        } as never);
        vi.mocked(prisma.document.create).mockResolvedValue({ id: 'doc-1' } as never);
        vi.mocked(provisionConsumerForClient).mockResolvedValue({ consumerId: 'cons-1', created: false, activationToken: null });
        vi.mocked(prisma.credoDocument.findFirst).mockResolvedValue(null as never);
        vi.mocked(prisma.credoDocument.create).mockResolvedValue({} as never);
    });

    it('files the PDF on the case, publishes it to the Crediva vault and sets the issued status', async () => {
        const result = await generateLegalFeeInvoiceDocument({ caseId: 'case-1', userId: 'u1', input });

        expect(result).toMatchObject({ ok: true, invoiceNumber: 'INV-0001', total: 1700, documentId: 'doc-1', portalPublished: true });
        expect(vi.mocked(prisma.document.create).mock.calls[0][0].data).toMatchObject({
            type: 'LEGAL_FEE_INVOICE', uploadedById: 'u1', extractedData: JSON.stringify({ feeInvoiceId: 'inv-1' }),
        });
        expect(prisma.credoDocument.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                consumerId: 'cons-1', category: 'INVOICE', originalName: 'INV-0001 Legal Fee Invoice.pdf', mimeType: 'application/pdf',
            }),
        });
        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ docType: 'LEGAL_FEE_INVOICE', event: 'UPLOADED', documentId: 'doc-1' }));
    });

    it('marks an automatic invoice, attributes it to no user, and leaves the workflow status alone when asked', async () => {
        await generateLegalFeeInvoiceDocument({ caseId: 'case-1', userId: null, input, moveStatus: false, autoIssued: true });

        const data = vi.mocked(prisma.document.create).mock.calls[0][0].data as Record<string, unknown>;
        expect(data.uploadedById).toBeUndefined();
        expect(data.extractedData).toBe(JSON.stringify({ feeInvoiceId: 'inv-1', autoIssued: true }));
        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ moveStatus: false, userId: null }));
    });

    it('returns 404 for an unknown case and passes through an invoice-creation failure', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null);
        expect(await generateLegalFeeInvoiceDocument({ caseId: 'nope', userId: 'u1', input })).toMatchObject({ ok: false, status: 404 });

        vi.mocked(createLegalFeeInvoice).mockResolvedValueOnce({ ok: false, status: 500, error: 'No default banking details found.' } as never);
        expect(await generateLegalFeeInvoiceDocument({ caseId: 'case-1', userId: 'u1', input })).toMatchObject({ ok: false, error: 'No default banking details found.' });
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('still succeeds when the portal publish fails', async () => {
        vi.mocked(provisionConsumerForClient).mockRejectedValueOnce(new Error('portal down'));
        const result = await generateLegalFeeInvoiceDocument({ caseId: 'case-1', userId: 'u1', input });
        expect(result).toMatchObject({ ok: true, portalPublished: false });
    });
});

describe('publishInvoiceToPortal', () => {
    const params = { clientId: 'client-1', displayName: 'INV-1 Legal Fee Invoice.pdf', storagePath: '/app/storage/uploads/case-1/x.pdf', size: 3 };
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(provisionConsumerForClient).mockResolvedValue({ consumerId: 'cons-1', created: false, activationToken: null });
        vi.mocked(prisma.credoDocument.findFirst).mockResolvedValue(null as never);
        vi.mocked(prisma.credoDocument.create).mockResolvedValue({} as never);
    });

    it('does not add a duplicate when the vault already holds the file', async () => {
        vi.mocked(prisma.credoDocument.findFirst).mockResolvedValue({ id: 'existing' } as never);
        expect(await publishInvoiceToPortal(params)).toBe(true);
        expect(prisma.credoDocument.create).not.toHaveBeenCalled();
    });

    it('returns false when the client has no Crediva profile (no 13-digit ID)', async () => {
        vi.mocked(provisionConsumerForClient).mockResolvedValue(null);
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue(null as never);
        expect(await publishInvoiceToPortal(params)).toBe(false);
        expect(prisma.credoDocument.create).not.toHaveBeenCalled();
    });
});
