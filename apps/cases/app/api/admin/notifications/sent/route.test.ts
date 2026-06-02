import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationLog: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { error: vi.fn() },
}));

const mockItems = [
    {
        id: 'log1',
        channel: 'EMAIL',
        recipient: 'client@example.com',
        message: 'Your case has been updated.',
        htmlBody: null,
        statusCode: 'CASE_UPDATED',
        provider: 'SMTP',
        sentAt: new Date('2026-06-01T10:00:00Z'),
        case: { id: 'c1', fileNumber: 'ZN-001', client: { id: 'cl1', firstName: 'John', lastName: 'Doe' } },
        sender: null,
    },
];

describe('GET /api/admin/notifications/sent', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns 403 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null);
        const req = new NextRequest('http://localhost/api/admin/notifications/sent');
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it('returns 403 when user is not admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', isAdmin: false } } as any);
        const req = new NextRequest('http://localhost/api/admin/notifications/sent');
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it('returns sent notifications with pagination', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', isAdmin: true } } as any);
        vi.mocked(prisma.notificationLog.count).mockResolvedValueOnce(1);
        vi.mocked(prisma.notificationLog.findMany).mockResolvedValueOnce(mockItems as any);

        const req = new NextRequest('http://localhost/api/admin/notifications/sent');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data).toHaveLength(1);
        expect(json.data[0].channel).toBe('EMAIL');
        expect(json.pagination.total).toBe(1);
        expect(json.pagination.page).toBe(1);
    });

    it('filters by channel when provided', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', isAdmin: true } } as any);
        vi.mocked(prisma.notificationLog.count).mockResolvedValueOnce(0);
        vi.mocked(prisma.notificationLog.findMany).mockResolvedValueOnce([]);

        const req = new NextRequest('http://localhost/api/admin/notifications/sent?channel=SMS');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ success: true, channel: 'SMS' }),
            })
        );
    });

    it('filters by search term when provided', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', isAdmin: true } } as any);
        vi.mocked(prisma.notificationLog.count).mockResolvedValueOnce(0);
        vi.mocked(prisma.notificationLog.findMany).mockResolvedValueOnce([]);

        const req = new NextRequest('http://localhost/api/admin/notifications/sent?search=john');
        await GET(req);

        expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ OR: expect.any(Array) }),
            })
        );
    });
});
