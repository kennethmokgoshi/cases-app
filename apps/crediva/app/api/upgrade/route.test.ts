import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        credoSubscription: {
            create: vi.fn(),
        },
        consumerAccount: {
            update: vi.fn(),
        },
    },
}));

describe('POST /api/upgrade', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 if user is not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null);
        
        const response = await POST();
        
        expect(response.status).toBe(401);
    });

    it('creates subscription and updates account on success', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        
        const mockSub = { id: 'sub-456' };
        vi.mocked(prisma.credoSubscription.create).mockResolvedValue(mockSub as any);
        vi.mocked(prisma.consumerAccount.update).mockResolvedValue({} as any);

        const response = await POST();
        const json = await response.json();
        
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        
        expect(prisma.credoSubscription.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                consumerId: 'user-123',
                planId: 'credo-premium',
                status: 'ACTIVE'
            })
        }));
        
        expect(prisma.consumerAccount.update).toHaveBeenCalledWith({
            where: { id: 'user-123' },
            data: { activeSubscriptionId: 'sub-456' }
        });
    });

    it('returns 500 on database error', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.credoSubscription.create).mockRejectedValue(new Error('DB Error'));

        const response = await POST();
        
        expect(response.status).toBe(500);
    });
});
