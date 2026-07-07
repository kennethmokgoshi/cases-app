import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { auth, sendStatusChangeNotification } from '@zenowethu/shared-lib';
import { POST } from './route';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
    sendStatusChangeNotification: vi.fn(),
}));

describe('POST /api/cases/[id]/dc-notification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(sendStatusChangeNotification).mockResolvedValue({
            smsSuccess: false,
            emailSuccess: true,
            whatsappSuccess: false,
            telegramSuccess: false,
            errors: [],
        });
    });

    it('uses the preferred DHS/DC email and copies the consumer for file requests', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-123',
            fileNumber: 'ZDM-001',
            acquisitionType: 'B2C',
            debtCounsellorName: 'Example DC',
            preferredDcEmail: 'preferred@example.com',
            lastKnownEmail: 'last@example.com',
            dcEmail: 'stored@example.com',
            client: {
                firstName: 'Thabo',
                lastName: 'Mokoena',
                email: 'thabo@example.com',
                idNumber: '8001015009087',
            },
            debtCounsellor: {
                preferredEmail: 'dc-master@example.com',
                lastKnownEmail: null,
                email: null,
            },
        } as any);

        const res = await POST(
            new Request('http://localhost/api/cases/case-123/dc-notification', {
                method: 'POST',
                body: JSON.stringify({ type: 'FILE_REQUEST' }),
            }),
            { params: Promise.resolve({ id: 'case-123' }) }
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.dcEmail).toBe('preferred@example.com');
        expect(sendStatusChangeNotification).toHaveBeenCalledWith(expect.objectContaining({
            dcEmail: 'preferred@example.com',
            clientEmail: 'thabo@example.com',
            dcCcEmails: ['thabo@example.com'],
            statusCode: 'REQUEST_FILE_DC',
        }));
    });

    it('returns 400 when no debt counsellor email is available', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-123',
            fileNumber: 'ZDM-001',
            acquisitionType: 'B2C',
            debtCounsellorName: 'Example DC',
            preferredDcEmail: null,
            lastKnownEmail: null,
            dcEmail: null,
            client: {
                firstName: 'Thabo',
                lastName: 'Mokoena',
                email: 'thabo@example.com',
                idNumber: '8001015009087',
            },
            debtCounsellor: null,
        } as any);

        const res = await POST(
            new Request('http://localhost/api/cases/case-123/dc-notification', {
                method: 'POST',
                body: JSON.stringify({ type: 'FILE_REQUEST' }),
            }),
            { params: Promise.resolve({ id: 'case-123' }) }
        );

        expect(res.status).toBe(400);
        expect(sendStatusChangeNotification).not.toHaveBeenCalled();
    });
});
