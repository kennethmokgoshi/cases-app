import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        invoice: { findUniqueOrThrow: vi.fn() },
        document: { create: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/finance/banking-details', () => ({
    resolveInvoiceBankingDetails: vi.fn().mockResolvedValue({ bankName: 'Bank', accountHolder: 'Co', accountNumber: '1', branchCode: '2' }),
}));

vi.mock('@zenowethu/shared-lib/src/finance/legal-fee-invoice', async () => {
    const { z } = await import('zod');
    return {
        createLegalFeeInvoice: vi.fn(),
        LegalFeeInvoiceInputSchema: z.object({
            amount: z.coerce.number().positive().default(1700),
            description: z.string().default('Legal fees'),
            dueInDays: z.coerce.number().default(7),
        }),
    };
});

vi.mock('@zenowethu/shared-lib/src/finance/fee-document-status', () => ({
    applyFeeDocumentStatus: vi.fn().mockResolvedValue({ moved: true, toStatus: 'LEGAL_FEE_INVOICE_ISSUED' }),
}));

vi.mock('@zenowethu/shared-lib/src/company/company-profile-service', async () => {
    const { ZENOWETHU_COMPANY_PROFILE } = await import('@zenowethu/shared-lib/src/company/profile');
    return { getCompanyProfile: vi.fn().mockResolvedValue(ZENOWETHU_COMPANY_PROFILE) };
});

vi.mock('@/lib/invoice-pdf', () => ({
    generateInvoicePdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { createLegalFeeInvoice } from '@zenowethu/shared-lib/src/finance/legal-fee-invoice';
import { applyFeeDocumentStatus } from '@zenowethu/shared-lib/src/finance/fee-document-status';

const mockAuth = vi.mocked(auth);
const mockCreate = vi.mocked(createLegalFeeInvoice);

const ctx = { params: Promise.resolve({ id: 'case-1' }) };
const request = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/legal-fee-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('POST /api/cases/[id]/legal-fee-invoice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: 'case-1', clientId: 'client-1', client: { idNumber: '8001015009087' } } as never);
        mockCreate.mockResolvedValue({ ok: true, invoice: { id: 'inv-1' } } as never);
        vi.mocked(prisma.invoice.findUniqueOrThrow).mockResolvedValue({
            id: 'inv-1', invoiceNumber: 'INV-2026-0001', issuedAt: new Date(), dueAt: new Date(), status: 'DRAFT',
            client: { firstName: 'John', lastName: 'Dlamini', email: 'j@x.test', phone: null, idNumber: '8001015009087' },
            case: { fileNumber: 'ZDM-001' }, lineItems: [{ description: 'Legal fees', quantity: 1, unitPrice: 1700 }],
            subtotal: 1700, vatRate: 0, vatAmount: 0, total: 1700, reference: '8001015009087', createdBy: null,
        } as never);
        vi.mocked(prisma.document.create).mockResolvedValue({ id: 'doc-9' } as never);
    });

    it('creates the R1,700 invoice by default, files the PDF and sets the issued status', async () => {
        const res = await POST(request({}), ctx);

        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ invoiceNumber: 'INV-2026-0001', total: 1700, documentId: 'doc-9' });
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ amount: 1700 }) }));
        expect(vi.mocked(prisma.document.create).mock.calls[0][0].data).toMatchObject({
            type: 'LEGAL_FEE_INVOICE',
            extractedData: JSON.stringify({ feeInvoiceId: 'inv-1' }),
        });
        expect(applyFeeDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({
            docType: 'LEGAL_FEE_INVOICE', event: 'UPLOADED', documentId: 'doc-9',
        }));
    });

    it('uses a staff-entered amount', async () => {
        await POST(request({ amount: 2500 }), ctx);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ amount: 2500 }) }));
    });

    it('surfaces a missing default bank account', async () => {
        mockCreate.mockResolvedValue({ ok: false, status: 500, error: 'No default banking details found.' } as never);
        const res = await POST(request({}), ctx);
        expect(res.status).toBe(500);
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('404 for an unknown case and 422 for a bad amount', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null);
        expect((await POST(request({}), ctx)).status).toBe(404);
        expect((await POST(request({ amount: -5 }), ctx)).status).toBe(422);
    });
});
