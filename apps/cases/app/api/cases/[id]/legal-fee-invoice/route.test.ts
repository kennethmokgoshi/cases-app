import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/finance/legal-fee-invoice', async () => {
    const { z } = await import('zod');
    return {
        LegalFeeInvoiceInputSchema: z.object({
            amount: z.coerce.number().positive().optional(),
            description: z.string().default('Legal fees'),
            dueInDays: z.coerce.number().default(7),
        }),
    };
});

vi.mock('@zenowethu/shared-lib/src/finance/legal-fee-document', () => ({
    generateLegalFeeInvoiceDocument: vi.fn(),
}));

import { POST } from './route';
import { auth, touchCaseAction } from '@zenowethu/shared-lib';
import { generateLegalFeeInvoiceDocument } from '@zenowethu/shared-lib/src/finance/legal-fee-document';

const mockAuth = vi.mocked(auth);
const mockGenerate = vi.mocked(generateLegalFeeInvoiceDocument);

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
        mockGenerate.mockResolvedValue({
            ok: true, invoiceId: 'inv-1', invoiceNumber: 'INV-2026-0001', total: 1700,
            documentId: 'doc-9', statusChange: { moved: true, toStatus: 'LEGAL_FEE_INVOICE_ISSUED' }, portalPublished: true,
        } as never);
    });

    it('generates the invoice for the signed-in user and reports the portal result', async () => {
        const res = await POST(request({}), ctx);

        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({
            invoiceNumber: 'INV-2026-0001', total: 1700, documentId: 'doc-9', portalPublished: true,
        });
        expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case-1', userId: 'u1' }));
        expect(touchCaseAction).toHaveBeenCalledWith('case-1', 'DOCUMENT_UPLOAD', { userId: 'u1' });
    });

    it('uses a staff-entered amount', async () => {
        await POST(request({ amount: 2500 }), ctx);
        expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ amount: 2500 }) }));
    });

    it('surfaces a generator failure such as a missing default bank account', async () => {
        mockGenerate.mockResolvedValue({ ok: false, status: 500, error: 'No default banking details found.' });
        const res = await POST(request({}), ctx);
        expect(res.status).toBe(500);
        expect(touchCaseAction).not.toHaveBeenCalled();
    });

    it('401 when signed out, 404 for an unknown case, 422 for a bad amount', async () => {
        mockAuth.mockResolvedValueOnce(null as never);
        expect((await POST(request({}), ctx)).status).toBe(401);

        mockGenerate.mockResolvedValueOnce({ ok: false, status: 404, error: 'Case not found' });
        expect((await POST(request({}), ctx)).status).toBe(404);

        expect((await POST(request({ amount: -5 }), ctx)).status).toBe(422);
    });
});
