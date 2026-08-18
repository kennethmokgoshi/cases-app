import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/documents/ingest', () => ({
    safeFileName: (n: string) => n.replace(/[^a-zA-Z0-9.-]/g, '_'),
    caseUploadDir: (base: string, caseId: string) => `${base}/storage/uploads/${caseId}`,
}));

vi.mock('fs/promises', () => ({
    readFile: vi.fn(async () => Buffer.from('pdf-bytes')),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        quarantinedDocument: { findUnique: vi.fn(), update: vi.fn() },
        case: { findUnique: vi.fn() },
        document: { create: vi.fn() },
        caseComment: { create: vi.fn() },
        workflowLog: { create: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

const TSHEPO = '9202204720082';
const THABO = '8001015009087';

const admin = {
    user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false, firstName: 'Ada', lastName: 'M' },
};
const member = {
    user: { id: 'u2', isAdmin: false, isExecutive: false, isSeniorManager: false, firstName: 'Bo', lastName: 'N' },
};

const quarantined = {
    id: 'q1',
    intendedCaseId: 'case-tshepo',
    fileName: 'invoice.pdf',
    storagePath: '/storage/quarantine/case-tshepo/invoice.pdf',
    fileSize: 1234,
    mimeType: 'application/pdf',
    detectedType: 'FEE_INVOICE',
    attachmentHash: 'hash1',
    reason: 'FOREIGN_ID_FOUND',
    extractedIdNumber: THABO,
    expectedIdNumber: TSHEPO,
    allExtractedIds: THABO,
    sourceMailboxId: 'mb1',
    sourceMessageId: '<msg1>',
    status: 'PENDING_REVIEW',
};

const thaboCase = {
    id: 'case-thabo',
    fileNumber: 'ZW-002',
    status: 'INVOICE_REQUESTED_DC',
    client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: THABO },
};

function makeReq(body: unknown) {
    return new Request('http://localhost/api/documents/quarantine/q1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const params = Promise.resolve({ id: 'q1' });

beforeEach(() => {
    vi.clearAllMocks();
    (prisma.quarantinedDocument.findUnique as any).mockResolvedValue(quarantined);
    (prisma.quarantinedDocument.update as any).mockResolvedValue({});
    (prisma.document.create as any).mockResolvedValue({ id: 'doc1' });
    (prisma.caseComment.create as any).mockResolvedValue({});
    (prisma.workflowLog.create as any).mockResolvedValue({});
});

describe('POST /api/documents/quarantine/[id]', () => {
    it('rejects unauthenticated callers', async () => {
        (auth as any).mockResolvedValue(null);
        const res = await POST(makeReq({ action: 'DISCARD', notes: 'x' }), { params });
        expect(res.status).toBe(401);
    });

    it('rejects staff without review permission', async () => {
        (auth as any).mockResolvedValue(member);
        const res = await POST(makeReq({ action: 'DISCARD', notes: 'x' }), { params });
        expect(res.status).toBe(401);
    });

    it('rejects an invalid body', async () => {
        (auth as any).mockResolvedValue(admin);
        const res = await POST(makeReq({ action: 'REASSIGN' }), { params });
        expect(res.status).toBe(400);
    });

    it('reassigns to the case whose client ID is inside the file', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.case.findUnique as any).mockResolvedValue(thaboCase);

        const res = await POST(makeReq({ action: 'REASSIGN', caseId: 'case-thabo' }), { params });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ownershipConfirmed).toBe(true);
        expect(prisma.document.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    caseId: 'case-thabo',
                    verificationStatus: 'VERIFIED',
                }),
            }),
        );
        expect(prisma.quarantinedDocument.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'REASSIGNED', reassignedToCaseId: 'case-thabo' }),
            }),
        );
    });

    it('refuses a target case whose ID is not in the file, without force', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.case.findUnique as any).mockResolvedValue({
            ...thaboCase,
            id: 'case-other',
            client: { firstName: 'Someone', lastName: 'Else', idNumber: '8504085800080' },
        });

        const res = await POST(makeReq({ action: 'REASSIGN', caseId: 'case-other' }), { params });
        const data = await res.json();

        expect(res.status).toBe(409);
        expect(data.requiresForce).toBe(true);
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('allows an explicit override and records it as unverified', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.case.findUnique as any).mockResolvedValue({
            ...thaboCase,
            id: 'case-other',
            client: { firstName: 'Someone', lastName: 'Else', idNumber: '8504085800080' },
        });

        const res = await POST(
            makeReq({ action: 'REASSIGN', caseId: 'case-other', force: true, notes: 'DC confirmed by phone' }),
            { params },
        );

        expect(res.status).toBe(200);
        expect(prisma.document.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ verificationStatus: 'UNVERIFIED' }),
            }),
        );
    });

    it('refuses to reassign back onto the case it was blocked on', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.case.findUnique as any).mockResolvedValue({
            ...thaboCase,
            id: 'case-tshepo',
            client: { firstName: 'Tshepo', lastName: 'Ndlovu', idNumber: TSHEPO },
        });

        const res = await POST(makeReq({ action: 'REASSIGN', caseId: 'case-tshepo' }), { params });
        expect(res.status).toBe(400);
        expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('discards with a recorded reason', async () => {
        (auth as any).mockResolvedValue(admin);
        const res = await POST(makeReq({ action: 'DISCARD', notes: 'Sent to us in error' }), { params });

        expect(res.status).toBe(200);
        expect(prisma.quarantinedDocument.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'DISCARDED', reviewNotes: 'Sent to us in error' }),
            }),
        );
    });

    it('will not action a document twice', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.quarantinedDocument.findUnique as any).mockResolvedValue({ ...quarantined, status: 'REASSIGNED' });

        const res = await POST(makeReq({ action: 'DISCARD', notes: 'x' }), { params });
        expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown record', async () => {
        (auth as any).mockResolvedValue(admin);
        (prisma.quarantinedDocument.findUnique as any).mockResolvedValue(null);

        const res = await POST(makeReq({ action: 'DISCARD', notes: 'x' }), { params });
        expect(res.status).toBe(404);
    });
});
