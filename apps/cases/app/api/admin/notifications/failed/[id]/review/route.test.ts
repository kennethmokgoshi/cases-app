import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationQueue: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
}));

describe('PATCH /api/admin/notifications/failed/[id]/review', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns 403 if unauthorized', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null);
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/review', { method: 'PATCH' });
        const res = await PATCH(req, { params: Promise.resolve({ id: 'q1' }) });
        expect(res.status).toBe(403);
    });

    it('returns 400 for invalid input', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN', isAdmin: true } } as any);
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/review', { 
            method: 'PATCH',
            body: JSON.stringify({ status: 'INVALID_STATUS' })
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: 'q1' }) });
        expect(res.status).toBe(400);
    });

    it('updates status to CANCELLED', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN', isAdmin: true } } as any);
        vi.mocked(prisma.notificationQueue.findUnique).mockResolvedValueOnce({ id: 'q1', status: 'HUMAN_REVIEW' } as any);
        
        const req = new NextRequest('http://localhost/api/admin/notifications/failed/q1/review', { 
            method: 'PATCH',
            body: JSON.stringify({ status: 'CANCELLED' })
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: 'q1' }) });
        
        expect(res.status).toBe(200);
        expect(prisma.notificationQueue.update).toHaveBeenCalledWith({
            where: { id: 'q1' },
            data: { status: 'CANCELLED' }
        });
    });
});
