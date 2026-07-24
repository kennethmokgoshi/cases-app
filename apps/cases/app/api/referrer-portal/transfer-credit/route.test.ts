import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
        creditTransfer: {
            create: vi.fn(),
        },
        payment: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback({
            creditTransfer: { create: vi.fn() },
            payment: { create: vi.fn() },
        })),
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { auth } from '@zenowethu/shared-lib';
import { POST } from './route';

describe('POST /api/referrer-portal/transfer-credit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when user is not authenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(401);
    });

    it('returns 403 when user does not have required role (FINANCE, EXECUTIVE, ADMIN)', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'REFERRER', email: 'user@example.com' },
        } as never);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.error).toContain('finance, executive, and admin');
    });

    it('returns 403 when user is not linked to a referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: false,
            status: 403,
            error: 'Not authorized',
        });

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(403);
    });

    it('returns 400 for invalid request data', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: -1000, // Invalid: negative
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Invalid request');
    });

    it('returns 404 when source or destination case not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(404);
    });

    it('returns 403 when cases do not belong to referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        vi.mocked(prisma.case.findUnique)
            .mockResolvedValueOnce({
                id: 'case-1',
                referrerId: 'ref-2', // Different referrer
                totalPaid: { toNumber: () => 5000 },
                fileNumber: 'ZDM-001',
            } as never)
            .mockResolvedValueOnce({
                id: 'case-2',
                referrerId: 'ref-1',
                fileNumber: 'ZDM-002',
            } as never);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(403);
    });

    it('returns 400 when source case has insufficient credit', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        vi.mocked(prisma.case.findUnique)
            .mockResolvedValueOnce({
                id: 'case-1',
                referrerId: 'ref-1',
                totalPaid: 500, // Only R500 available
                fileNumber: 'ZDM-001',
            } as never)
            .mockResolvedValueOnce({
                id: 'case-2',
                referrerId: 'ref-1',
                fileNumber: 'ZDM-002',
            } as never);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 1000, // Trying to transfer R1000
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Insufficient credit available');
    });

    it('returns 400 when source and destination are the same', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        vi.mocked(prisma.case.findUnique)
            .mockResolvedValueOnce({
                id: 'case-1',
                referrerId: 'ref-1',
                totalPaid: 5000,
                fileNumber: 'ZDM-001',
            } as never)
            .mockResolvedValueOnce({
                id: 'case-1', // Same case
                referrerId: 'ref-1',
                fileNumber: 'ZDM-001',
            } as never);

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-1',
                amount: 1000,
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Source and destination must be different cases');
    });

    it('successfully transfers credit between cases', async () => {
        const mockTx = {
            creditTransfer: {
                create: vi.fn().mockResolvedValueOnce({
                    id: 'transfer-1',
                    fromCase: { fileNumber: 'ZDM-001' },
                    toCase: { fileNumber: 'ZDM-002' },
                    amount: 2000,
                    createdAt: new Date('2026-07-24T10:00:00Z'),
                }),
            },
            payment: {
                create: vi.fn().mockResolvedValueOnce({ id: 'payment-1' }),
            },
        };

        vi.mocked(auth).mockResolvedValueOnce({
            user: { role: 'FINANCE', email: 'user@example.com' },
        } as never);
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'John', lastName: 'Doe' },
        });

        vi.mocked(prisma.case.findUnique)
            .mockResolvedValueOnce({
                id: 'case-1',
                referrerId: 'ref-1',
                totalPaid: 5000,
                fileNumber: 'ZDM-001',
            } as never)
            .mockResolvedValueOnce({
                id: 'case-2',
                referrerId: 'ref-1',
                fileNumber: 'ZDM-002',
            } as never);

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
            return callback(mockTx as never);
        });

        const request = new Request('http://localhost/api/referrer-portal/transfer-credit', {
            method: 'POST',
            body: JSON.stringify({
                fromCaseId: 'case-1',
                toCaseId: 'case-2',
                amount: 2000,
                notes: 'Credit transfer from overpayment',
            }),
        });

        const res = await POST(request);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.transfer.id).toBe('transfer-1');
        expect(json.transfer.amount).toBe('2000');
    });
});
