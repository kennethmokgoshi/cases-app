import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        document: {
            create: vi.fn(),
        },
        referrerPaymentQuery: {
            create: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
        inAppNotification: {
            create: vi.fn(),
        },
    },
}));

vi.mock('fs/promises', () => ({
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
    existsSync: () => true,
}));

// Mock the parseMultipartForm helper
vi.mock('@/lib/form-parser', () => ({
    parseMultipartForm: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { parseMultipartForm } from '@/lib/form-parser';
import { POST } from './route';

describe('POST /api/referrer-portal/referrals/[caseId]/payment-report', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports payment and uploads proof of payment', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });

        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-1',
            assignedToId: 'staff-1',
            referrerCommission: { id: 'com-1' },
        } as never);

        // Mock parseMultipartForm to return fields and file
        vi.mocked(parseMultipartForm).mockResolvedValueOnce({
            fields: {
                amount: '450.50',
                date: '2026-07-15',
                notes: 'Client paid direct EFT.',
            },
            files: [
                {
                    name: 'pop.pdf',
                    fieldName: 'proofOfPayment',
                    buffer: Buffer.from('testpdfcontent'),
                    type: 'application/pdf',
                },
            ],
        });

        vi.mocked(prisma.document.create).mockResolvedValueOnce({
            id: 'doc-123',
            fileName: 'pop.pdf',
        } as never);

        vi.mocked(prisma.referrerPaymentQuery.create).mockResolvedValueOnce({
            id: 'query-123',
            status: 'PENDING',
        } as never);

        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-123',
            content: 'Payment reported: R 450.50 paid on 2026-07-15.',
        } as never);

        vi.mocked(prisma.inAppNotification.create).mockResolvedValueOnce({} as never);

        const res = await POST(
            new Request('http://localhost/api/referrer-portal/referrals/case-1/payment-report', { method: 'POST' }),
            { params: Promise.resolve({ caseId: 'case-1' }) }
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.document.id).toBe('doc-123');
        expect(json.paymentQuery.status).toBe('PENDING');

        expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                type: 'PROOF_OF_PAYMENT',
                fileName: 'pop.pdf',
                mimeType: 'application/pdf',
            }),
        }));

        expect(prisma.referrerPaymentQuery.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                referrerId: 'ref-1',
                caseId: 'case-1',
                commissionId: 'com-1',
                claimedAmount: 450.50,
                status: 'PENDING',
            }),
        }));
    });
});
