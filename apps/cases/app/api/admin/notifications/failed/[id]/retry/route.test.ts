import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { NextRequest } from 'next/server';
import { executeNotificationRetry } from '@zenowethu/shared-lib/notifications/service';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationQueue: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/notifications/service', () => ({
    executeNotificationRetry: vi.fn(),
}));

describe('POST /api/admin/notifications/failed/[id]/retry', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns 403 if unauthorized', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null);
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/retry', { method: 'POST' });
        const res = await POST(req, { params: Promise.resolve({ id: 'q1' }) });
        expect(res.status).toBe(403);
    });

    it('returns 404 if not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN' } } as any);
        vi.mocked(prisma.notificationQueue.findUnique).mockResolvedValueOnce(null);
        
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/retry', { method: 'POST' });
        const res = await POST(req, { params: Promise.resolve({ id: 'q1' }) });
        
        expect(res.status).toBe(404);
    });

    it('retries successfully', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN' } } as any);
        vi.mocked(prisma.notificationQueue.findUnique).mockResolvedValueOnce({ id: 'q1', status: 'PENDING_RETRY' } as any);
        vi.mocked(executeNotificationRetry).mockResolvedValueOnce({ smsSuccess: true } as any);
        
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/retry', { method: 'POST' });
        const res = await POST(req, { params: Promise.resolve({ id: 'q1' }) });
        
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(executeNotificationRetry).toHaveBeenCalledWith('q1');
    });

    it('returns 500 on retry failure', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN' } } as any);
        vi.mocked(prisma.notificationQueue.findUnique).mockResolvedValueOnce({ id: 'q1', status: 'PENDING_RETRY' } as any);
        vi.mocked(executeNotificationRetry).mockResolvedValueOnce({ emailSuccess: false, errors: ['Failed'] } as any);
        
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/retry', { method: 'POST' });
        const res = await POST(req, { params: Promise.resolve({ id: 'q1' }) });
        
        expect(res.status).toBe(500);
    });
});
