import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConsumerSubscription } from './subscription';
import { prisma } from '@zenowethu/database';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        consumerAccount: {
            findUnique: vi.fn(),
        },
    },
}));

describe('getConsumerSubscription', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns false when no account exists', async () => {
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue(null);
        
        const result = await getConsumerSubscription('123');
        
        expect(result.isPremium).toBe(false);
        expect(result.subscription).toBeNull();
    });

    it('returns false when account has no active subscription', async () => {
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({
            id: '123',
            activeSubscription: null
        } as any);
        
        const result = await getConsumerSubscription('123');
        
        expect(result.isPremium).toBe(false);
        expect(result.subscription).toBeNull();
    });

    it('returns true when account has ACTIVE subscription', async () => {
        const mockSub = { id: 'sub1', status: 'ACTIVE' };
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({
            id: '123',
            activeSubscription: mockSub
        } as any);
        
        const result = await getConsumerSubscription('123');
        
        expect(result.isPremium).toBe(true);
        expect(result.subscription).toEqual(mockSub);
    });

    it('returns true when account has TRIALING subscription', async () => {
        const mockSub = { id: 'sub1', status: 'TRIALING' };
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({
            id: '123',
            activeSubscription: mockSub
        } as any);
        
        const result = await getConsumerSubscription('123');
        
        expect(result.isPremium).toBe(true);
        expect(result.subscription).toEqual(mockSub);
    });

    it('returns false when account has CANCELLED or EXPIRED subscription', async () => {
        const mockSub = { id: 'sub1', status: 'CANCELLED' };
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({
            id: '123',
            activeSubscription: mockSub
        } as any);
        
        const result = await getConsumerSubscription('123');
        
        expect(result.isPremium).toBe(false);
        expect(result.subscription).toEqual(mockSub);
    });
});
