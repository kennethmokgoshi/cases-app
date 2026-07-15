import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { parseMultipartForm } from '@/lib/form-parser';
import { POST } from './route';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@/lib/form-parser', () => ({
    parseMultipartForm: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
    existsSync: () => true,
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        document: {
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

function req() {
    return new Request('http://localhost/api/referrer-portal/referrals/case-123/documents', {
        method: 'POST',
    });
}

describe('POST /api/referrer-portal/referrals/[caseId]/documents', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates document and discussion comment', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });

        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-123',
            fileNumber: 'ZDM-123',
            assignedToId: 'staff-1',
        } as never);

        vi.mocked(parseMultipartForm).mockResolvedValueOnce({
            fields: { documentType: 'ID_DOCUMENT', notes: 'Client ID document.' },
            files: [{ name: 'id.pdf', fieldName: 'file', buffer: Buffer.from('hello'), type: 'application/pdf' }],
        });

        vi.mocked(prisma.document.create).mockResolvedValueOnce({
            id: 'doc-1',
            createdAt: new Date(),
        } as never);

        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-1',
            content: 'Auto comment',
            createdAt: new Date(),
            user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
        } as never);

        vi.mocked(prisma.inAppNotification.create).mockResolvedValueOnce({} as never);

        const res = await POST(req(), { params: Promise.resolve({ caseId: 'case-123' }) });
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-123',
                type: 'ID_DOCUMENT',
                fileName: 'id.pdf',
            }),
        }));
        expect(prisma.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-123',
                content: expect.stringContaining('id.pdf'),
                type: 'REFERRER',
            }),
        }));
        expect(prisma.inAppNotification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'staff-1',
                type: 'REFERRER_DOCUMENT_UPLOAD',
            }),
        }));
    });
});
