import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
        notificationLog: {
            findMany: vi.fn(),
        },
        caseComment: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
    getSMTPCredentials: vi.fn(() => Promise.resolve({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'transfers@zenowethu.co.za',
        password: 'password',
        fromEmail: 'transfers@zenowethu.co.za',
    })),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { GET } from './route';

type PrismaMock = {
    case: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    notificationLog: {
        findMany: ReturnType<typeof vi.fn>;
    };
    caseComment: {
        findMany: ReturnType<typeof vi.fn>;
    };
};

const db = prisma as unknown as PrismaMock;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

function request(): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails/verify-request', {
        method: 'GET',
    });
}

const params = { params: Promise.resolve({ id: 'case-1' }) };

describe('GET /api/cases/[id]/dhs-decline/check-fee-emails/verify-request', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', role: 'STAFF' } });
        db.case.findUnique.mockResolvedValue({
            id: 'case-1',
            fileNumber: 'FN-12345',
            preferredDcEmail: 'dc@example.com',
            client: {
                firstName: 'John',
                lastName: 'Doe',
                idNumber: '8503095543083',
            },
            debtCounsellor: {
                preferredEmail: 'dc@example.com',
                lastKnownEmail: 'dc@example.com',
                email: 'dc@example.com',
            },
        });
        db.caseComment.findMany.mockResolvedValue([]);
    });

    it('rejects unauthenticated requests', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        const res = await GET(request(), params);
        expect(res.status).toBe(401);
    });

    it('returns 404 when case is not found', async () => {
        db.case.findUnique.mockResolvedValueOnce(null);
        const res = await GET(request(), params);
        expect(res.status).toBe(404);
    });

    it('returns hasRequested: false when no notification logs or comments exist', async () => {
        db.notificationLog.findMany.mockResolvedValueOnce([]);
        db.caseComment.findMany.mockResolvedValueOnce([]);
        const res = await GET(request(), params);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toEqual({
            success: true,
            hasRequested: false,
            count: 0,
            firstSentAt: null,
            lastSentAt: null,
            allSentFromSameSender: true,
            allSentToSameRecipient: true,
            commonSender: null,
            commonRecipient: null,
            isPreferred: false,
            source: 'Mixed / Multiple sources',
            emails: [],
        });
    });

    it('calculates the correct first/last dates, metadata, and count when combined logs and comments exist', async () => {
        const mockLogs = [
            {
                id: 'log-1',
                sentAt: new Date('2026-06-10T10:00:00.000Z'),
                recipient: 'dc@example.com',
                message: 'Invoice Request — Client',
            },
        ];
        const mockComments = [
            {
                id: 'comment-1',
                createdAt: new Date('2026-07-05T14:30:00.000Z'),
                content: 'Sent invoice request to DC (dc@example.com)',
            },
        ];
        db.notificationLog.findMany.mockResolvedValueOnce(mockLogs);
        db.caseComment.findMany.mockResolvedValueOnce(mockComments);

        const res = await GET(request(), params);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.hasRequested).toBe(true);
        expect(body.count).toBe(2);
        expect(body.firstSentAt).toBe(mockLogs[0].sentAt.toISOString());
        expect(body.lastSentAt).toBe(mockComments[0].createdAt.toISOString());
        expect(body.allSentFromSameSender).toBe(true); // Both are sent from transfers@zenowethu.co.za
        expect(body.allSentToSameRecipient).toBe(true); // Both match dc@example.com
        expect(body.commonRecipient).toBe('dc@example.com');
        expect(body.isPreferred).toBe(true);
        expect(body.source).toBe('Preferred email override manually saved on case');
        expect(body.emails[0].sender).toBe('transfers@zenowethu.co.za');
        expect(body.emails[1].sender).toBe('transfers@zenowethu.co.za');
        expect(body.emails[1].subject).toBe('Invoice Request — John Doe (8503095543083) — FN-12345');
    });
});
