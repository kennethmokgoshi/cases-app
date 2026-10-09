import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/finance/fee-document-service', async () => {
    const { z } = await import('zod');
    return {
        markFeeDocumentPaid: vi.fn(),
        MarkFeePaidSchema: z.object({
            amount: z.coerce.number().positive(),
            paidAt: z.coerce.date(),
            method: z.enum(['EFT', 'CASH', 'DEBIT_ORDER', 'CARD', 'OTHER']).default('EFT'),
            reference: z.string().optional().nullable(),
        }),
    };
});

import { POST } from './route';
import { auth } from '@zenowethu/shared-lib';
import { markFeeDocumentPaid } from '@zenowethu/shared-lib/src/finance/fee-document-service';

const mockAuth = vi.mocked(auth);
const mockMarkPaid = vi.mocked(markFeeDocumentPaid);

const ctx = { params: Promise.resolve({ id: 'case-1', documentId: 'doc-1' }) };
const request = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/fee-documents/doc-1/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('POST /api/cases/[id]/fee-documents/[documentId]/mark-paid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never);
    });

    it('records the payment', async () => {
        mockMarkPaid.mockResolvedValue({ ok: true, paymentId: 'pay-1', statusChange: { moved: true, toStatus: 'LEGAL_FEE_PAID' } });

        const res = await POST(request({ amount: 1700, paidAt: '2026-09-20' }), ctx);

        expect(res.status).toBe(201);
        expect(mockMarkPaid).toHaveBeenCalledWith(expect.objectContaining({
            caseId: 'case-1', documentId: 'doc-1', userId: 'u1',
            input: expect.objectContaining({ amount: 1700, method: 'EFT' }),
        }));
    });

    it('422 for a zero amount, without touching the service', async () => {
        const res = await POST(request({ amount: 0, paidAt: '2026-09-20' }), ctx);
        expect(res.status).toBe(422);
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('404 when the document is not on the case, 422 when not payable', async () => {
        mockMarkPaid.mockResolvedValueOnce({ ok: false, failure: 'DOCUMENT_NOT_FOUND', error: 'nope' });
        expect((await POST(request({ amount: 10, paidAt: '2026-09-20' }), ctx)).status).toBe(404);

        mockMarkPaid.mockResolvedValueOnce({ ok: false, failure: 'NOT_PAYABLE', error: 'nope' });
        expect((await POST(request({ amount: 10, paidAt: '2026-09-20' }), ctx)).status).toBe(422);
    });

    it('401 when signed out', async () => {
        mockAuth.mockResolvedValue(null as never);
        expect((await POST(request({ amount: 10, paidAt: '2026-09-20' }), ctx)).status).toBe(401);
    });
});
