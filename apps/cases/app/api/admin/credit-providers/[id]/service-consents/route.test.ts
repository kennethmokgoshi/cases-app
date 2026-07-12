import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        creditProvider: { findUnique: vi.fn() },
        creditProviderServiceConsentDocument: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock('fs', () => ({ existsSync: vi.fn() }));
vi.mock('fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';

import { GET, POST } from './route';
import { PATCH, DELETE } from './[docId]/route';

const adminSession = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false } };
const memberSession = { user: { id: 'u2', isAdmin: false, isExecutive: false, isSeniorManager: false } };
const provider = { id: 'cp-1', name: 'FNB' };
const serviceDoc = {
    id: 'doc-1',
    creditProviderId: 'cp-1',
    title: 'Consent to service by email',
    fileName: 'fnb-consent.pdf',
    fileUrl: '/uploads/credit-provider-service-consents/cp-1/fnb-consent.pdf',
    fileSize: 100,
    mimeType: 'application/pdf',
    consentScope: 'EMAIL_SERVICE',
    receivedFrom: 'FNB Legal',
    effectiveDate: null,
    expiresAt: null,
    notes: null,
    isActive: true,
    uploadedById: 'u1',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
};

function ctx(id = 'cp-1', docId = 'doc-1') {
    return { params: Promise.resolve({ id, docId }) };
}

function uploadReq(file?: File) {
    const form = new FormData();
    if (file) form.set('file', file);
    form.set('title', 'FNB email service consent');
    form.set('receivedFrom', 'FNB Legal');
    form.set('effectiveDate', '2026-07-10');
    form.set('notes', 'Reusable for all FNB matters');
    return new Request('http://localhost/api/admin/credit-providers/cp-1/service-consents', {
        method: 'POST',
        body: form,
    });
}

function jsonReq(body: unknown) {
    return new Request('http://localhost/api/admin/credit-providers/cp-1/service-consents/doc-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(provider as never);
    vi.mocked(prisma.creditProviderServiceConsentDocument.findMany).mockResolvedValue([serviceDoc] as never);
    vi.mocked(prisma.creditProviderServiceConsentDocument.findFirst).mockResolvedValue(serviceDoc as never);
    vi.mocked(prisma.creditProviderServiceConsentDocument.create).mockResolvedValue(serviceDoc as never);
    vi.mocked(prisma.creditProviderServiceConsentDocument.update).mockResolvedValue({ ...serviceDoc, isActive: false } as never);
    vi.mocked(prisma.creditProviderServiceConsentDocument.delete).mockResolvedValue(serviceDoc as never);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
});

describe('GET /api/admin/credit-providers/[id]/service-consents', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/test'), ctx());
        expect(res.status).toBe(401);
    });

    it('returns provider documents for authenticated staff', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as never);
        const res = await GET(new Request('http://localhost/test'), ctx());
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.provider.name).toBe('FNB');
        expect(json.documents).toHaveLength(1);
    });
});

describe('POST /api/admin/credit-providers/[id]/service-consents', () => {
    it('returns 403 for members', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as never);
        const file = new File([new Uint8Array([1, 2, 3])], 'consent.pdf', { type: 'application/pdf' });
        const res = await POST(uploadReq(file), ctx());
        expect(res.status).toBe(403);
    });

    it('validates that a file is supplied', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as never);
        const res = await POST(uploadReq(), ctx());
        expect(res.status).toBe(422);
    });

    it('stores the uploaded consent-service document under the credit provider', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as never);
        const file = new File([new Uint8Array([1, 2, 3])], 'consent.pdf', { type: 'application/pdf' });
        const res = await POST(uploadReq(file), ctx());

        expect(res.status).toBe(201);
        expect(writeFile).toHaveBeenCalled();
        expect(prisma.creditProviderServiceConsentDocument.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                creditProviderId: 'cp-1',
                title: 'FNB email service consent',
                fileName: 'consent.pdf',
                mimeType: 'application/pdf',
                uploadedById: 'u1',
            }),
        });
    });
});

describe('PATCH/DELETE /api/admin/credit-providers/[id]/service-consents/[docId]', () => {
    it('updates active status', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as never);
        const res = await PATCH(jsonReq({ isActive: false }), ctx());
        expect(res.status).toBe(200);
        expect(prisma.creditProviderServiceConsentDocument.update).toHaveBeenCalledWith({
            where: { id: 'doc-1' },
            data: { isActive: false },
        });
    });

    it('deletes a provider consent document', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as never);
        const res = await DELETE(new Request('http://localhost/test', { method: 'DELETE' }), ctx());
        expect(res.status).toBe(200);
        expect(prisma.creditProviderServiceConsentDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });
});
