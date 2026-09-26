import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        document: { findFirst: vi.fn(), update: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', async () => {
    const workflow = await import('@zenowethu/shared-lib/src/finance/fee-document-workflow');
    return {
        auth: vi.fn(),
        createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
        touchCaseAction: vi.fn(),
        FEE_DOCUMENT_TYPES: workflow.FEE_DOCUMENT_TYPES,
        isFeeDocumentType: workflow.isFeeDocumentType,
    };
});

vi.mock('@zenowethu/shared-lib/src/finance/fee-document-status', () => ({
    applyFeeDocumentStatus: vi.fn(),
}));

import { PATCH } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { applyFeeDocumentStatus } from '@zenowethu/shared-lib/src/finance/fee-document-status';

const mockApply = vi.mocked(applyFeeDocumentStatus);
const ctx = { params: Promise.resolve({ id: 'case-1' }) };
const patch = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/documents?documentId=doc-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('PATCH /api/cases/[id]/documents (change type)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
        vi.mocked(prisma.document.findFirst).mockResolvedValue({ id: 'doc-1', fileName: 'pop.pdf' } as never);
        vi.mocked(prisma.document.update).mockResolvedValue({ id: 'doc-1', caseId: 'case-1', type: 'PROOF_OF_PAYMENT' } as never);
    });

    it('re-typing a document as proof of payment moves the case status', async () => {
        mockApply.mockResolvedValue({ moved: true, toStatus: 'POP_RECEIVED' });

        const res = await PATCH(patch({ type: 'PROOF_OF_PAYMENT' }), ctx);

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ statusChange: { moved: true, toStatus: 'POP_RECEIVED' } });
        expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({
            caseId: 'case-1', documentId: 'doc-1', docType: 'PROOF_OF_PAYMENT', event: 'UPLOADED',
        }));
    });

    it('a non-fee type does not touch the status', async () => {
        vi.mocked(prisma.document.update).mockResolvedValue({ id: 'doc-1', caseId: 'case-1', type: 'PAYSLIP' } as never);
        const res = await PATCH(patch({ type: 'PAYSLIP' }), ctx);
        expect(res.status).toBe(200);
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('rejects an unknown type', async () => {
        const res = await PATCH(patch({ type: 'NOT_A_TYPE' }), ctx);
        expect(res.status).toBe(400);
        expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('404 when the document is not on this case', async () => {
        vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
        const res = await PATCH(patch({ type: 'PROOF_OF_PAYMENT' }), ctx);
        expect(res.status).toBe(404);
        expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('still succeeds if the status update throws', async () => {
        mockApply.mockRejectedValue(new Error('db down'));
        const res = await PATCH(patch({ type: 'PROOF_OF_PAYMENT' }), ctx);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ statusChange: { moved: false } });
    });
});
