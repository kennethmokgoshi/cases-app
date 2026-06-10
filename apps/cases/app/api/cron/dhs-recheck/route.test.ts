import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findMany: vi.fn() },
        user: { findFirst: vi.fn() },
        client: { update: vi.fn() },
        document: { findFirst: vi.fn(), update: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib/src/automation/run-logger', () => ({
    logAutomationRun: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user-1'),
}));

vi.mock('@zenowethu/shared-lib/src/automation/workflow-engine', () => ({
    updateCaseStatus: vi.fn(),
    setNextUpdate: vi.fn(),
    addSystemComment: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/dhs', () => ({
    checkTransferStatus: vi.fn(),
    closeBrowser: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/openai', () => ({
    analyzeDocument: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { updateCaseStatus, setNextUpdate, addSystemComment } from '@zenowethu/shared-lib/src/automation/workflow-engine';
import { checkTransferStatus } from '@zenowethu/shared-lib/src/dhs';
import { analyzeDocument } from '@zenowethu/shared-lib/src/openai';
import { POST, mapDhsResultToStatus, normalizeIdNumber } from './route';

const CRON_SECRET = 'test-cron-secret';

function makeReq(secret?: string) {
    return new Request('http://localhost/api/cron/dhs-recheck', {
        method: 'POST',
        headers: secret ? { 'x-cron-secret': secret } : undefined,
    });
}

const notLinkedCase = {
    id: 'case-1',
    fileNumber: 'ZW-001',
    status: 'NOT_LINKED',
    nextUpdate: null,
    client: { id: 'client-1', firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
};

const idDocument = {
    id: 'doc-1',
    fileUrl: '/uploads/case-1/id.pdf',
    fileName: 'id.pdf',
    mimeType: 'application/pdf',
    extractedData: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'admin-1' } as never);
});

describe('normalizeIdNumber', () => {
    it('returns digits for a valid 13-digit ID', () => {
        expect(normalizeIdNumber('8001015009087')).toBe('8001015009087');
        expect(normalizeIdNumber(' 800101 5009 087 ')).toBe('8001015009087');
    });

    it('returns null for invalid or missing IDs', () => {
        expect(normalizeIdNumber('12345')).toBeNull();
        expect(normalizeIdNumber(null)).toBeNull();
        expect(normalizeIdNumber(undefined)).toBeNull();
        expect(normalizeIdNumber('no digits here')).toBeNull();
    });
});

describe('mapDhsResultToStatus', () => {
    it('returns null when consumer is still not linked', () => {
        expect(mapDhsResultToStatus({ found: false, status: 'NOT_LINKED' } as never)).toBeNull();
    });

    it('maps not-found-but-linked to NOT_REQUESTED_VIA_DHS', () => {
        expect(mapDhsResultToStatus({ found: false, status: 'NOT_REQUESTED' } as never)?.status).toBe('NOT_REQUESTED_VIA_DHS');
    });

    it('maps PENDING to REQUESTED_VIA_DHS', () => {
        expect(mapDhsResultToStatus({ found: true, status: 'PENDING', daysCounter: '3 days' } as never)?.status).toBe('REQUESTED_VIA_DHS');
    });

    it('maps ACCEPTED and AUTO_TRANSFERRED to ACCEPTED_VIA_DHS', () => {
        expect(mapDhsResultToStatus({ found: true, status: 'ACCEPTED' } as never)?.status).toBe('ACCEPTED_VIA_DHS');
        expect(mapDhsResultToStatus({ found: true, status: 'AUTO_TRANSFERRED' } as never)?.status).toBe('ACCEPTED_VIA_DHS');
    });

    it('maps DECLINED to DECLINED_VIA_DHS', () => {
        expect(mapDhsResultToStatus({ found: true, status: 'DECLINED', declineReason: 'fees owed' } as never)?.status).toBe('DECLINED_VIA_DHS');
    });
});

describe('POST /api/cron/dhs-recheck', () => {
    it('returns 401 without cron secret or admin session', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(makeReq());
        expect(res.status).toBe(401);
    });

    it('returns 401 with a wrong cron secret and non-admin session', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { isAdmin: false } } as never);
        const res = await POST(makeReq('wrong-secret'));
        expect(res.status).toBe(401);
    });

    it('does nothing when there are no NOT_LINKED cases', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([] as never);
        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.stats.scanned).toBe(0);
        expect(checkTransferStatus).not.toHaveBeenCalled();
    });

    it('skips cases whose nextUpdate is in the future', async () => {
        const future = new Date(Date.now() + 86400000);
        vi.mocked(prisma.case.findMany).mockResolvedValue([{ ...notLinkedCase, nextUpdate: future }] as never);
        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();
        expect(data.stats.notDueYet).toBe(1);
        expect(checkTransferStatus).not.toHaveBeenCalled();
    });

    it('updates the case status when DHS now finds the consumer', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([notLinkedCase] as never);
        vi.mocked(checkTransferStatus).mockResolvedValue({ found: true, status: 'PENDING', daysCounter: '2 days' } as never);

        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();

        expect(data.stats.statusChanged).toBe(1);
        expect(updateCaseStatus).toHaveBeenCalledWith('case-1', 'REQUESTED_VIA_DHS', 'auto-user-1');
        expect(analyzeDocument).not.toHaveBeenCalled();
    });

    it('leaves the case NOT_LINKED with +5 working days when re-analysed ID matches the database', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([notLinkedCase] as never);
        vi.mocked(checkTransferStatus).mockResolvedValue({ found: false, status: 'NOT_LINKED' } as never);
        vi.mocked(prisma.document.findFirst).mockResolvedValue(idDocument as never);
        vi.mocked(analyzeDocument).mockResolvedValue({ data: { idNumber: '8001015009087' } } as never);

        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();

        expect(data.stats.stillNotLinked).toBe(1);
        expect(data.stats.idCorrected).toBe(0);
        expect(prisma.client.update).not.toHaveBeenCalled();
        expect(setNextUpdate).toHaveBeenCalledWith('case-1', 5, 'auto-user-1');
        // DHS only checked once — no re-check when the ID matches
        expect(checkTransferStatus).toHaveBeenCalledTimes(1);
    });

    it('corrects the ID and re-checks DHS when re-analysed ID differs', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([notLinkedCase] as never);
        vi.mocked(checkTransferStatus)
            .mockResolvedValueOnce({ found: false, status: 'NOT_LINKED' } as never)
            .mockResolvedValueOnce({ found: true, status: 'PENDING', daysCounter: 'New' } as never);
        vi.mocked(prisma.document.findFirst).mockResolvedValue(idDocument as never);
        vi.mocked(analyzeDocument).mockResolvedValue({ data: { idNumber: '9202204720082' } } as never);

        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();

        expect(data.stats.idCorrected).toBe(1);
        expect(data.stats.statusChanged).toBe(1);
        expect(prisma.client.update).toHaveBeenCalledWith({
            where: { id: 'client-1' },
            data: { idNumber: '9202204720082' },
        });
        expect(checkTransferStatus).toHaveBeenCalledTimes(2);
        expect(checkTransferStatus).toHaveBeenLastCalledWith('9202204720082');
        expect(updateCaseStatus).toHaveBeenCalledWith('case-1', 'REQUESTED_VIA_DHS', 'auto-user-1');
    });

    it('flags a duplicate when the corrected ID belongs to another client', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([notLinkedCase] as never);
        vi.mocked(checkTransferStatus).mockResolvedValue({ found: false, status: 'NOT_LINKED' } as never);
        vi.mocked(prisma.document.findFirst).mockResolvedValue(idDocument as never);
        vi.mocked(analyzeDocument).mockResolvedValue({ data: { idNumber: '9202204720082' } } as never);
        vi.mocked(prisma.client.update).mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();

        expect(data.stats.errors).toBe(1);
        expect(setNextUpdate).toHaveBeenCalledWith('case-1', 5, 'auto-user-1');
        expect(checkTransferStatus).toHaveBeenCalledTimes(1);
        expect(addSystemComment).toHaveBeenCalledWith(
            'case-1',
            expect.stringContaining('duplicate'),
            'auto-user-1'
        );
    });

    it('keeps the case NOT_LINKED when no ID document exists to re-analyse', async () => {
        vi.mocked(prisma.case.findMany).mockResolvedValue([notLinkedCase] as never);
        vi.mocked(checkTransferStatus).mockResolvedValue({ found: false, status: 'NOT_LINKED' } as never);
        vi.mocked(prisma.document.findFirst).mockResolvedValue(null as never);

        const res = await POST(makeReq(CRON_SECRET));
        const data = await res.json();

        expect(data.stats.stillNotLinked).toBe(1);
        expect(analyzeDocument).not.toHaveBeenCalled();
        expect(setNextUpdate).toHaveBeenCalledWith('case-1', 5, 'auto-user-1');
    });
});
