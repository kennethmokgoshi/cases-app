import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationQueue: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
}));

describe('GET /api/admin/notifications/failed', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns 403 if unauthorized', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null);
        const req = new NextRequest('http://localhost/api/admin/notifications/failed');
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it('fetches failed notifications', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN', isAdmin: true } } as any);
        const mockData = [{ id: 'q1', channel: 'EMAIL', status: 'PENDING_RETRY' }];
        vi.mocked(prisma.notificationQueue.findMany).mockResolvedValueOnce(mockData as any);
        
        const req = new NextRequest('http://localhost/api/admin/notifications/failed');
        const res = await GET(req);
        
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data).toEqual(mockData);
        expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: { not: 'SUCCESS' } }
        }));
    });
});
